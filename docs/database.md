# Database (Supabase)

Postgres via Supabase. Schema is managed **only** through SQL migrations in `supabase/migrations/`. Never edit the schema from the dashboard in a shared environment.

## Local workflow

```bash
pnpm db:start                 # start local Supabase (Docker required); prints URL + keys
pnpm exec supabase status     # show keys again → copy into .env.local
pnpm db:migration add_thing   # create supabase/migrations/<ts>_add_thing.sql
pnpm db:reset                 # rebuild local DB from migrations + seed.sql
pnpm db:types                 # regenerate types from local DB
pnpm db:types:linked          # regenerate types from linked hosted project
pnpm db:stop
```

Studio: http://127.0.0.1:54323 · Inbucket (auth emails): http://127.0.0.1:54324

## Deploying migrations

```bash
pnpm exec supabase link --project-ref <ref>
pnpm db:push                  # always --linked (explicit; CLI default is changing)
```

Run in CI/CD against staging first, then production. Migrations must be forward-only; to undo, write a new migration.

## Migration rules

1. One logical change per migration. Name it `snake_case` describing the change.
2. **Every table in `public` gets RLS enabled in the same migration that creates it.** No exceptions.
3. Write explicit policies per operation (`select`, `insert`, `update`, `delete`) and role (`to authenticated`). No catch-all `for all` policies unless genuinely identical.
4. Use `(select auth.uid())` (wrapped) in policies — it's evaluated once per query, not per row.
5. Index every foreign key and every column used in RLS predicates.
6. Standard columns: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` + `public.set_updated_at()` trigger.
7. Functions: `set search_path = ''` and fully-qualify names. `security definer` only when needed, and never exposing it to callers who could abuse it.
8. Comment non-obvious tables/columns (`comment on …`).
9. After any migration: `pnpm db:reset && pnpm db:types`, commit the regenerated types.
10. Destructive changes (drop/rename column) ship in two deploys: stop using it in code → then drop.

## Data access in code

```
service.ts  ──►  repository.ts  ──►  supabase client
```

- `repository.ts` is the **only** place that references table/column names. It maps rows → domain types (`snake_case` → `camelCase`).
- Use the **server client** (`@/lib/supabase/server`) by default — it runs as the user, so RLS applies.
- `@/lib/supabase/admin` bypasses RLS. Only for trusted backend jobs/webhooks, never with user-supplied filters, and always after an explicit authorization check.
- Check `error` on every Supabase call; wrap in `AppError` with `cause`.

## Current schema

| Table | Purpose | RLS |
| --- | --- | --- |
| `profiles` | 1:1 with `auth.users`; created by `on_auth_user_created` trigger. `role` (`parent`/`child`) comes from `raw_app_meta_data.jarso_role` only; GoTrue's admin `createUser` writes app metadata in an UPDATE after the insert, so `on_auth_user_app_metadata_updated` applies `jarso_role = child` then (only to a profile in no family); `nickname` is child-only | select: self, parent of, or approved member of caller's family; update: own row, parent profiles only, columns `full_name`, `avatar_url` only |
| `families` | Family hub: 6-char sign-in `code`, `currency` (ISO 4217), IANA `timezone` | select: approved members; writes via functions only |
| `family_members` | Profile ↔ family link with `role`, `status` (`approved`/`removed`), consent and approval; `profile_id` unique (one family per profile); child rows (and only child rows) carry `nickname_key` = `lower(btrim(nickname))`, unique per family | select: approved members of the family; writes via functions only |
| `audit_log` | Append-only record of parent-controlled changes (`action`, `subject_id`, `details`) | select: approved parents of the family; insert via functions only |
| `child_credentials` | Child PIN as bcrypt `pin_hash`, `set_by`, and the cross-source safety cap: `recent_failures` in the 24 h window from `recent_failures_since`; `frozen_at` once it reaches 100 (locked everywhere until a PIN reset) | RLS on, **no policies**: service role and definer functions only |
| `child_pin_attempts` | Lockout per (`child_id`, `source_hash` = SHA-256 of the client IP): `failed_attempts`, `lock_count` (locks since last success/reset from that source), `locked_until` | RLS on, **no policies**, no grants to `anon`/`authenticated`: definer functions only |
| `invitations` | Child-started request (`kind = child_to_parent`) with `nickname`, `parent_email` (nullable, cleared on accept), unique `token_hash` / `code_hash` (raw link token and short code never stored), `status` (`pending`/`accepted`/`expired`), `expires_at` (7 days); `accepted_by`, `child_id`, `family_id` set on accept | RLS on, **no policies**: service role and definer functions only |
| `usage_counters` | Fixed-window rate-limit counters keyed by (`key`, `window_start`). Keys never hold a raw IP or email: those parts are SHA-256 hex (`pin:ip:<hash>`, `invite:email:<hash>`) | RLS on, **no policies**: service role only |

TODO (slice 2, with `pg_cron`): retention job that deletes old `usage_counters` windows, expired or accepted `invitations`, and stale `child_pin_attempts` rows.

RLS helpers (`stable security definer`, `search_path = ''`, executable by `authenticated` only): `is_approved_member(family_id)`, `is_parent_of(child_id)`, `is_self(child_id)`, `current_family_id()`. Reuse them in every family-scoped policy.

Functions:

- `create_family(currency, timezone) → uuid` — caller must be a `parent` with no membership; raises `JA401` / `JA403` / `JA409`, `22023` for an unknown timezone.
- `register_child(child_id, family_id, nickname, pin, consent, invitation_id default null)` — approved parent of the family adds a child-role profile with no membership. With `invitation_id`, locks the invitation `for update` and requires it `pending` and unexpired, then marks it `accepted` (`accepted_by`, `child_id`, `family_id`) in the same transaction. Clears `parent_email` on the accepted invitation. Overwrites any stale `child_credentials` row and clears the child's lock state. Raises `JA403` (not a parent of the family, or no consent), `22023` (PIN not 4–6 digits, nickname not 1–20 letters, digits, spaces or `_ . ' -`), `JA404` (invitation missing, used or expired), `JA409` (child unavailable or nickname taken). Audits `child.added` and, with an invitation, `invitation.accepted`.
- `set_child_pin(child_id, pin)` — `is_parent_of` caller; sets the PIN and clears every lock (all `child_pin_attempts` rows and the safety cap). Audits `child.pin_reset`. The service then rotates the child's password and calls `revoke_user_sessions`.
- `verify_child_pin(family_code, nickname, pin, source_hash) → table(child_id, status)` — **service_role only**. Normalises the code (upper, no spaces/hyphens) and nickname (`lower(btrim)`). `status` is `ok` (child_id set), `invalid` (unknown family/nickname, removed child or wrong PIN) or `locked` (this source locked, or the child frozen by the safety cap). Never raises for a bad sign-in so the counters commit. Per source: every 5th consecutive wrong PIN locks that source; lock *n* lasts 15 min × 2^(n−1), capped at 24 hours; a success from that source clears its row. Across sources: 100 wrong PINs within 24 h set `frozen_at` until `set_child_pin`. Each lock start writes `audit_log` `child.locked` (`details.scope` = `source` or `all`; no IP, no PIN). Unknown family or nickname spends a dummy bcrypt so timing reveals nothing.
- `revoke_user_sessions(user_id) → integer` — **service_role only**; deletes the user's `auth.sessions` rows (refresh tokens and MFA claims cascade) and returns the count. Call only after the service's own authz.
- `create_invitation(nickname, parent_email, token_hash, code_hash) → uuid` — **service_role only**; trims and validates the nickname (1–20 letters, digits, spaces or `_ . ' -`, else `22023`), stores a `pending` invitation expiring in 7 days. Callers hash the token and code first.
- `find_invitation(hash) → table(id, nickname)` — **service_role only**; the service calls it after `assertRole("parent")` and a per-parent rate limit. Matches `token_hash` or `code_hash` of a `pending`, unexpired invitation, else no rows.
- `hit_rate_limit(key, window, max) → boolean` — **service_role only**; counts a hit in the `date_bin(window, now(), epoch)` window and returns `true` while the count is within `max`.
