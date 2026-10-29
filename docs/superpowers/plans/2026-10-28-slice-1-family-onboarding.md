# Slice 1 — Family & Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent signs up, creates a family, and adds a child either directly or by accepting a child-started invitation; the child signs in with family code + nickname + PIN. Nobody can see another family.

**Architecture:** New `family` feature module over four new tables (`families`, `family_members`, `invitations`, `child_credentials`) plus `audit_log` and `usage_counters`. Every membership change goes through a `security definer` Postgres function; RLS uses `is_approved_member` / `is_parent_of` / `is_self`. Child auth users are created with the admin client (synthetic email, `app_metadata.jarso_role = 'child'`), and child sessions are minted with `generateLink` + `verifyOtp` after `verify_child_pin` succeeds.

**Tech Stack:** Next.js 16 App Router (Cache Components), Supabase (Postgres, Auth, pgcrypto, pgTAP via `supabase test db`), Zod, Vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-10-28-first-milestone-design.md` (slices 0 and 1). Also read `docs/architecture.md` §5–7, ADRs 0004/0005, `docs/database.md`, `docs/auth.md`, `docs/conventions.md`, `docs/design.md`.

This is the first of seven slice plans. Slices 2–6 get their own plans once this one merges, because they build on the exact schema and helpers produced here.

## Global Constraints

- All CLAUDE.md hard rules apply (feature modules, barrels, server/client barrel split, layering, `requireUser`/`assertUser`, Suspense for request-time reads, migrations-only schema, RLS per operation in the same migration, Zod on every input, `AppError`, `logger` not `console`, env only via `src/config/env.*`, Biome).
- Role and family membership are set only by `security definer` functions or by `app_metadata` (service-role only). Never from `user_metadata`, profile updates, or request bodies (invariant 15).
- Child-started onboarding stores only nickname + parent email (invariant 16). No child auth user exists until a parent accepts.
- Guardian consent (D7): every child membership row has `consent_at` and `consent_by` set; functions refuse without consent.
- Invitations always yield a copyable link and a short code; email is sent additionally only when `RESEND_API_KEY` is set (D13).
- PIN: 4–6 digits, bcrypt via `extensions.crypt(pin, extensions.gen_salt('bf'))`; lockout after **5** failures for **15 minutes**; parent-only set/reset.
- Synthetic child email: `<profile uuid>@child.jarso.invalid`.
- Family code: 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; input normalised by uppercasing and stripping spaces and hyphens.
- Invitation short code: 8 characters from the same alphabet; token: 32 random bytes base64url. Store only SHA-256 hashes of both. Expiry 7 days.
- Custom SQLSTATEs raised by functions: `JA401` unauthorized, `JA403` forbidden, `JA404` not found, `JA409` conflict, `JA423` locked, `JA429` rate limited. Mapped to `AppError` codes in one place.
- Child-facing copy is short and encouraging (design.md voice); no blame on errors.
- Public repo: no keys in code, seeds, fixtures or logs. Use `sb_secret_…` placeholders in docs.

## Review Focus

1. **Nickname case/whitespace** — "Sam" and " sam" in one family must collide; sign-in with any casing of the nickname works. Test in Task 3.
2. **Family code typed loosely** — `abc-23x`, ` ABC23X ` sign in the same as `ABC23X`. Test in Task 5.
3. **Stale or reused invitation** — an expired, already-accepted or unknown token/code shows a friendly message and creates nothing; accepting twice (double tap) creates one child. Test in Task 4.
4. **Partial failure while adding a child** — if the DB step fails after the auth user is created, the auth user is deleted; no orphan child account can sign in. Test in Task 6.
5. **Wrong role in the wrong area** — a parent opening `/child` and a child opening `/parent` are redirected to their own home; sign-up with an `@child.jarso.invalid` email is rejected. Test in Tasks 7 and 9.

---

## File Structure

```
supabase/migrations/
  <ts>_family_core.sql            # profiles.role/nickname, families, family_members, audit_log, RLS helpers, create_family
  <ts>_child_accounts.sql         # child_credentials, register_child, set_child_pin, verify_child_pin, usage_counters, hit_rate_limit
  <ts>_invitations.sql            # invitations, create_invitation, find_invitation, accept via register_child
supabase/tests/database/
  _helpers.psql                   # create test users, authenticate_as(uuid), reset role
  family_core.test.sql
  child_accounts.test.sql
  invitations.test.sql
src/lib/db-error.ts (+ .test.ts)  # SQLSTATE → AppError
src/features/family/
  index.ts                        # client-safe barrel: components, schemas, types
  schemas.ts (+ .test.ts)         # Zod: createFamily, addChild, startChildOnboarding, acceptInvitation, childSignIn, setChildPin
  codes.ts (+ .test.ts)           # normaliseFamilyCode, generateCode, hashToken (pure)
  types.ts
  components/                     # create-family-form, add-child-form, start-onboarding-form, invite-share-card,
                                  # accept-invitation-form, child-sign-in-form, child-switcher, set-pin-form
  server/
    index.ts                      # import "server-only"; exports DAL + services
    repository.ts                 # only file naming tables/functions
    service.ts                    # createFamily, addChild, startChildOnboarding, acceptInvitation, childSignIn, setChildPin
    dal.ts                        # getMembership, requireRole, assertRole, assertParentOf
    child-auth.ts                 # createChildAuthUser, deleteChildAuthUser, mintChildSession (admin client)
    actions.ts                    # "use server" createAction wrappers
src/features/notifications/server/email.ts  # sendEmail adapter (no-op when unconfigured)
src/app/
  (app)/parent/page.tsx, (app)/parent/setup/page.tsx, (app)/parent/children/new/page.tsx, (app)/parent/layout.tsx
  (app)/child/page.tsx, (app)/child/layout.tsx
  (app)/dashboard/page.tsx        # becomes role redirect
  (auth)/start/page.tsx           # child-started onboarding (public)
  (auth)/sign-in/child/page.tsx   # child sign-in (public)
  invite/page.tsx                 # parent accepts (token in query or code entry)
tests/e2e/onboarding.spec.ts, tests/e2e/global-setup.ts
```

---

### Task 0: Slice 0 — fold decisions into the docs

Runs on the current branch `docs/first-milestone-spec`, before slice 1 branches off.

**Files:**
- Modify: `REQUIREMENTS.md` (Open decisions; FR14 Purchases bullet; first-milestone acceptance criteria if wording needs D2)
- Modify: `docs/architecture.md` (§5.1 entity fields, §7.2 handover rule, §7.2 reminders paragraph, §14 first-milestone row, §15)
- Modify: `docs/domain.md` (invariant 6 note, glossary rows for Spending limit and Family link)

- [ ] **Step 1:** In REQUIREMENTS.md, move each resolved item out of "Open decisions" into a new "Decided for the pilot (2026-10-28)" list with the spec's D1–D7, D10, D12, D13 wording. Keep pilot countries, emergency jar, pilot thresholds open. Add to FR14 Purchases: "A purchase that would take Spend below zero is refused unless the parent has allowed overspending. Limits never block."
- [ ] **Step 2:** In architecture.md apply every bullet of spec §4 (occurrence `amount_minor` + `shortfall_minor`, `per_month`, `child_settings.allow_negative_spend`, family `timezone` + `clock_offset`, consent columns, invitation link + code, deposits in first milestone, reminder every 3 days). Update §14's first-milestone row to include deposits and the demo clock; remove resolved items from §15's open list.
- [ ] **Step 3:** In domain.md add to invariant 6: "Separately, a purchase that would take Spend below zero is refused unless the parent allows overspending (D2)."
- [ ] **Step 4:** Verify no stale statement remains: `grep -n "per_week\"\|cash+saved = due\|Whether a parent can link\|Reminder timing" REQUIREMENTS.md docs/*.md` → no matches that contradict the spec.
- [ ] **Step 5:** Commit and open the PR.

```bash
git add REQUIREMENTS.md docs/architecture.md docs/domain.md
git commit -m "docs: record first milestone decisions"
```

Then: `git switch -c feat/family-onboarding` from this branch for Tasks 1–10.

---

### Task 1: Database test harness

**Files:**
- Create: `supabase/tests/database/_helpers.psql`, `supabase/tests/database/harness.test.sql`
- Modify: `package.json` (script `"db:test": "supabase test db"`), `.github/workflows/ci.yml` (migrations job: run `supabase test db` after reset), `docs/testing.md` (DB row: pgTAP, location, command)

**Interfaces:**
- Produces (psql, included with `\ir _helpers.psql` at the top of every test file, inside the test's transaction):
  - `tests.create_user(email text, role text default 'parent') returns uuid` — inserts into `auth.users` with `raw_app_meta_data = jsonb_build_object('jarso_role', role)`; profile row comes from the trigger.
  - `tests.authenticate_as(user_id uuid) returns void` — `set local role authenticated` + `set local request.jwt.claims` with `sub`.
  - `tests.clear_auth() returns void` — `reset role`.

- [ ] **Step 1:** Write `harness.test.sql`: `begin; select plan(2);` creates a user, `authenticate_as` it, asserts `auth.uid()` equals the id, `clear_auth()` then asserts `current_user = 'postgres'`; `select * from finish(); rollback;`.
- [ ] **Step 2:** Run `pnpm db:start && pnpm db:test` → FAIL (helpers missing).
- [ ] **Step 3:** Write `_helpers.psql` (`create extension if not exists pgtap with schema extensions; create schema if not exists tests;` + the three functions). If `\ir` is not honoured by `supabase test db`, put the helpers in `supabase/tests/database/000-setup.test.sql` creating them outside a transaction and make other files depend on run order; note which one worked in `docs/testing.md`.
- [ ] **Step 4:** `pnpm db:test` → PASS.
- [ ] **Step 5:** Commit: `test(db): add pgtap harness`.

---

### Task 2: Family core schema and RLS

**Files:**
- Create: `supabase/migrations/<ts>_family_core.sql`, `supabase/tests/database/family_core.test.sql`
- Modify: `src/types/database.types.ts` (regenerated), `docs/database.md` (Current schema table)

**Interfaces:**
- Produces (SQL):
  - `profiles.role text not null default 'parent' check (role in ('parent','child'))`, `profiles.nickname text` (child only). `handle_new_user` sets role from `raw_app_meta_data ->> 'jarso_role'` (default `'parent'`), never from `raw_user_meta_data`. Column-level grant: `authenticated` may update only `full_name`, `avatar_url`.
  - `families(id uuid pk, code text unique not null, currency text not null check (currency ~ '^[A-Z]{3}$'), timezone text not null default 'UTC', created_by uuid not null, created_at, updated_at)`.
  - `family_members(family_id, profile_id unique, role, status check in ('approved','removed'), consent_at, consent_by, approved_by, approved_at, created_at; pk (family_id, profile_id); check (role <> 'child' or consent_at is not null))`. `profile_id unique` = one family per profile in the pilot.
  - `audit_log(id, family_id, actor_id, action text, subject_id uuid, details jsonb, created_at)` — insert by functions only; select by approved parents of the family.
  - `public.is_approved_member(p_family_id uuid) returns boolean`, `public.is_parent_of(p_child_id uuid) returns boolean`, `public.is_self(p_child_id uuid) returns boolean`, `public.current_family_id() returns uuid` — all `stable security definer set search_path = ''`.
  - `public.create_family(p_currency text, p_timezone text) returns uuid` — caller must be role `parent` with no membership (`JA409` otherwise); generates a unique code; inserts family + approved parent membership; writes `audit_log('family.created')`.
- RLS: `families` select = `is_approved_member(id)`; `family_members` select = `is_approved_member(family_id)`; no insert/update/delete policies (functions only). `profiles` select = self, or `is_parent_of(id)`, or the profile is an approved member of the caller's family (`current_family_id()`).

- [ ] **Step 1:** Write `family_core.test.sql` with these assertions (two families A and B, parent PA/PB, plus an unrelated parent PX):
  - `create_family('GBP','Europe/London')` as PA returns an id; `families.code` matches `^[A-HJ-NP-Z2-9]{6}$`.
  - second `create_family` as PA → `throws_ok(..., 'JA409')`.
  - `create_family` as a role-`child` user → `throws_ok(..., 'JA403')`.
  - as PB: `select count(*) from families where id = <A>` = 0; same for `family_members`, `audit_log`.
  - as PX (no family): sees 0 families.
  - as PA: `update profiles set role = 'child' where id = PA` → `throws_ok` (permission denied, column grant); `update profiles set full_name = 'x'` succeeds.
  - inserting into `auth.users` with `raw_user_meta_data = '{"jarso_role":"child"}'` yields a profile with role `parent`.
  - direct `insert into family_members` as PA → `throws_ok` (RLS).
- [ ] **Step 2:** `pnpm db:test` → FAIL.
- [ ] **Step 3:** Write the migration. Index `family_members(family_id)`, `audit_log(family_id, created_at desc)`. `comment on` each new table. `revoke execute on function ... from public, anon` and `grant execute ... to authenticated` for `create_family` and the predicates.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test && pnpm exec supabase db lint --local --fail-on error` → PASS, no lint errors.
- [ ] **Step 5:** `pnpm db:types`; update `docs/database.md`; `pnpm check` → PASS (fix `profiles` repository types if the regen changes them).
- [ ] **Step 6:** Commit: `feat(db): add families, members and rls helpers`.

---

### Task 3: Child accounts, PIN and rate limits (SQL)

**Files:**
- Create: `supabase/migrations/<ts>_child_accounts.sql`, `supabase/tests/database/child_accounts.test.sql`
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Consumes: Task 2 tables and predicates.
- Produces (SQL):
  - `child_credentials(profile_id pk references profiles, pin_hash text not null, failed_attempts int not null default 0, locked_until timestamptz, set_by uuid not null, updated_at)`. RLS on, **no policies** (service role and definer functions only).
  - `family_members.nickname_key text` (= `lower(btrim(nickname))`, set by `register_child`) with unique index `(family_id, nickname_key) where role = 'child'`.
  - `public.register_child(p_child_id uuid, p_family_id uuid, p_nickname text, p_pin text, p_consent boolean, p_invitation_id uuid default null) returns void` — `security definer`, granted to `authenticated`. Requires: caller is approved parent of `p_family_id` (`JA403`); `p_consent` true (`JA403`); `p_child_id` is a role-`child` profile with no membership (`JA409`); PIN `^[0-9]{4,6}$` (`22023`); nickname 1–20 chars after trim, unique in family (`JA409`). Sets `profiles.nickname`, inserts membership with consent + approval by caller, inserts credentials, writes `audit_log('child.added')`. The `p_invitation_id` branch is added in Task 4.
  - `public.set_child_pin(p_child_id uuid, p_pin text) returns void` — caller `is_parent_of` (`JA403`); resets `failed_attempts`, `locked_until`; `audit_log('child.pin_reset')`.
  - `public.verify_child_pin(p_family_code text, p_nickname text, p_pin text) returns uuid` — granted to `service_role` only. Normalises code (upper, strip spaces/hyphens) and nickname (`lower(btrim)`); unknown family/nickname → `JA401`; locked → `JA423`; wrong PIN → increments, sets `locked_until = now() + interval '15 minutes'` on the 5th failure, raises `JA401`; correct → resets counters and returns the child's profile id. Removed members → `JA401`.
  - `usage_counters(key text, window_start timestamptz, count int, pk (key, window_start))`, RLS on, no policies.
  - `public.hit_rate_limit(p_key text, p_window interval, p_max int) returns boolean` — `service_role` only; upserts the counter for `date_bin(p_window, now(), 'epoch')`; returns `true` when the request is allowed.

- [ ] **Step 1:** Write `child_accounts.test.sql`:
  - setup: family A with parent PA; child user C (`tests.create_user(..., 'child')`).
  - as PA `register_child(C, A, 'Sam', '1234', true)` succeeds; `family_members` row has `consent_by = PA`, `status = 'approved'`.
  - `register_child` for another child with nickname `' sam '` → `throws_ok 'JA409'` (Review Focus 1).
  - `register_child` with `p_consent = false` → `JA403`; PIN `'12a4'` → `22023`; as parent PB of family B → `JA403`; reusing C → `JA409`.
  - as service_role: `verify_child_pin(lower(code), 'SAM', '1234') = C` (Review Focus 1); four wrong PINs raise `JA401`; fifth wrong raises `JA401` and sets `locked_until`; correct PIN now raises `JA423`.
  - as PA `set_child_pin(C, '9876')` clears the lock; `verify_child_pin(..., '9876') = C`.
  - as authenticated: `select verify_child_pin(...)` → permission denied; `select * from child_credentials` → 0 rows.
  - `hit_rate_limit('k', '1 minute', 2)` returns true, true, false.
- [ ] **Step 2:** `pnpm db:test` → FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** `pnpm db:reset && pnpm db:test && pnpm exec supabase db lint --local --fail-on error` → PASS.
- [ ] **Step 5:** `pnpm db:types && pnpm check` → PASS.
- [ ] **Step 6:** Commit: `feat(db): add child credentials and pin verification`.

---

### Task 4: Invitations (SQL)

**Files:**
- Create: `supabase/migrations/<ts>_invitations.sql`, `supabase/tests/database/invitations.test.sql`
- Modify: `src/types/database.types.ts`

**Interfaces:**
- Consumes: Task 3 `register_child`.
- Produces (SQL):
  - `invitations(id, kind text check (kind = 'child_to_parent'), nickname text not null, parent_email text not null, token_hash text unique not null, code_hash text unique not null, status check in ('pending','accepted','expired'), expires_at timestamptz not null, accepted_by uuid, child_id uuid, family_id uuid, created_at)`. RLS on, no policies.
  - `public.create_invitation(p_nickname text, p_parent_email text, p_token_hash text, p_code_hash text) returns uuid` — `service_role` only; `expires_at = now() + interval '7 days'`.
  - `public.find_invitation(p_hash text) returns table(id uuid, nickname text)` — `authenticated`; matches `token_hash` or `code_hash`, pending and unexpired only; else empty.
  - `register_child(..., p_invitation_id)` (replace function): when given, locks the invitation `for update`; must be pending and unexpired (`JA404` otherwise); marks it `accepted` with `accepted_by`, `child_id`, `family_id` in the same transaction.

- [ ] **Step 1:** Write `invitations.test.sql`:
  - service_role creates an invitation; as PA `find_invitation(token_hash)` returns 1 row with the nickname; `find_invitation(code_hash)` too; unknown hash → 0 rows.
  - as PA `register_child(C, A, 'Mia', '1234', true, inv)` succeeds; invitation is `accepted`, `child_id = C`.
  - second `register_child` with a new child id and the same invitation → `JA404`; `find_invitation` now returns 0 rows (Review Focus 3).
  - invitation with `expires_at` in the past → `find_invitation` 0 rows; `register_child` with it → `JA404`.
  - as authenticated, `select create_invitation(...)` → permission denied; `select * from invitations` → 0 rows.
- [ ] **Step 2–4:** FAIL → migration → `pnpm db:reset && pnpm db:test` PASS + lint clean.
- [ ] **Step 5:** `pnpm db:types && pnpm check` → PASS.
- [ ] **Step 6:** Commit: `feat(db): add child-started invitations`.

---

### Task 5: Pure helpers, schemas and DB error mapping

**Files:**
- Create: `src/lib/db-error.ts`, `src/lib/db-error.test.ts`, `src/features/family/codes.ts`, `src/features/family/codes.test.ts`, `src/features/family/schemas.ts`, `src/features/family/schemas.test.ts`, `src/features/family/types.ts`, `src/features/family/index.ts`
- Modify: `src/lib/index.ts` (export `db-error`), `src/config/site.ts` (currencies list)

**Interfaces:**
- Produces:
  - `toAppError(error: { code?: string; message?: string } | null, fallback: string): AppError` — `JA401→UNAUTHORIZED`, `JA403→FORBIDDEN`, `JA404→NOT_FOUND`, `JA409→CONFLICT`, `JA423→RATE_LIMITED` ("Too many tries. Ask your parent or wait 15 minutes."), `JA429→RATE_LIMITED`, `22023→VALIDATION`, else `INTERNAL` with `fallback`. Always sets `cause`.
  - `normaliseFamilyCode(input: string): string`, `generateCode(length: number): string` (crypto-random, alphabet from Global Constraints), `generateToken(): string`, `hashSecret(value: string): Promise<string>` (SHA-256 hex via `crypto.subtle`), `childEmail(profileId: string): string`.
  - Zod: `createFamilySchema {currency: enum(supportedCurrencies), timezone: string IANA-valid via Intl}`, `addChildSchema {nickname: 1–20 trimmed, pin: /^\d{4,6}$/, consent: literal "on"|true}`, `startChildOnboardingSchema {nickname, parentEmail: z.email()}`, `acceptInvitationSchema {invite: string (token or code), nickname?, pin, consent}`, `childSignInSchema {familyCode, nickname, pin}`, `setChildPinSchema {childId: uuid, pin}`.
  - `supportedCurrencies = ["GBP","EUR","USD","INR","AUD","CAD","JPY"] as const` in `src/config/site.ts`.
  - Types: `Membership = { familyId: string; role: "parent" | "child"; status: "approved" }`, `Family = { id; code; currency; timezone }`, `ChildSummary = { id; nickname }`.

- [ ] **Step 1:** Tests: `normaliseFamilyCode(" abc-23x ") === "ABC23X"` (Review Focus 2); `generateCode(6)` matches `/^[A-HJ-NP-Z2-9]{6}$/` over 100 runs; `hashSecret("x")` is 64 hex chars and stable; `childEmail(id) === \`${id}@child.jarso.invalid\``; `toAppError({code:"JA423"}, "f").code === "RATE_LIMITED"`; unknown code → `INTERNAL` with message `"f"`; `addChildSchema` rejects `"12a4"`, `"123"`, `"1234567"`, missing consent; `startChildOnboardingSchema` rejects bad email; `createFamilySchema` rejects timezone `"Mars/Base"`.
- [ ] **Step 2:** `pnpm test` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `pnpm check` → PASS.
- [ ] **Step 5:** Commit: `feat(family): add codes, schemas and db error mapping`.

---

### Task 6: Server layer — repository, child auth, services, DAL

**Files:**
- Create: `src/features/family/server/{index,repository,service,dal,child-auth}.ts`, `src/features/family/server/service.test.ts`, `src/features/notifications/server/{index,email}.ts`, `src/features/notifications/index.ts`
- Modify: `src/config/env.server.ts` + `.env.example` (`RESEND_API_KEY` optional, `EMAIL_FROM` optional), `src/features/auth/server/session.ts` (no change to signature; `SessionUser` gains nothing — role comes from the DAL)

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces (`@/features/family/server`):
  - `getMembership(): Promise<Membership | null>` — `cache`d per request; reads via server client.
  - `requireRole(role: "parent" | "child", next: string): Promise<{ user: SessionUser; membership: Membership | null }>` — redirects signed-out to login, wrong role to the other role's home (`/parent` or `/child`) (Review Focus 5). A parent with no membership is allowed (needs `/parent/setup`).
  - `assertRole(role)`, `assertParentOf(childId: string): Promise<SessionUser>` — throw `FORBIDDEN`.
  - `createFamily(input: CreateFamilyInput): Promise<Family>`
  - `listChildren(): Promise<ChildSummary[]>`, `getFamily(): Promise<Family | null>`
  - `addChild(input: { familyId: string; nickname: string; pin: string; invitationId?: string }): Promise<ChildSummary>` — `createChildAuthUser()` then `register_child` RPC via the **user's** server client; on any RPC error, `deleteChildAuthUser(id)` then rethrow mapped error (Review Focus 4).
  - `startChildOnboarding(input, ip: string): Promise<{ link: string; code: string }>` — rate limits `invite:ip:<ip>` 5/hour and `invite:email:<lower email>` 3/day via `hit_rate_limit` (admin client); `create_invitation` with hashes; `sendEmail` best-effort (failure logged, never thrown). Link = `${NEXT_PUBLIC_APP_URL}/invite?token=<token>`.
  - `findInvitation(invite: string): Promise<{ id: string; nickname: string } | null>` — tries token hash, then normalised code hash.
  - `acceptInvitation(input): Promise<ChildSummary>` — requires membership (parent with a family; UI routes to setup first), then `addChild` with `invitationId`.
  - `childSignIn(input, ip): Promise<void>` — rate limit `pin:ip:<ip>` 20/15 min; `verify_child_pin` via admin client; `mintChildSession(childId)`.
  - `setChildPin(input): Promise<void>`.
  - `child-auth.ts`: `createChildAuthUser(): Promise<string>` (admin `createUser` with `email = childEmail(newId)`, random 32-byte password, `email_confirm: true`, `app_metadata: { jarso_role: "child" }`; generate the uuid first with `crypto.randomUUID()` and pass `id`), `deleteChildAuthUser(id)`, `mintChildSession(childId)` (admin `generateLink({ type: "magiclink", email })` → server client `verifyOtp({ type: "magiclink", token_hash: properties.hashed_token })`; if `"magiclink"` is rejected use `"email"` and record which in docs/auth.md).
  - `@/features/notifications/server`: `sendEmail(msg: { to: string; subject: string; text: string }): Promise<"sent" | "skipped">` — `fetch("https://api.resend.com/emails")` when `RESEND_API_KEY` and `EMAIL_FROM` set, else logs `email skipped` (no recipient in log) and returns `"skipped"`.

- [ ] **Step 1: Spike session minting first.** Throwaway script or route on a local Supabase: create a child auth user with the synthetic `.invalid` email, generate a link, verify the OTP, confirm `getClaims().sub` equals the child id. If GoTrue rejects the `.invalid` domain, switch to `child.jarso.local` and update Global Constraints, ADR 0004 and the spec. Delete the spike.
- [ ] **Step 2: Write `service.test.ts`** (mock repository and child-auth modules at the boundary):
  - `addChild` deletes the created auth user when `register_child` rejects, and rethrows `CONFLICT` for `JA409`.
  - `startChildOnboarding` returns `{link, code}` and still resolves when `sendEmail` throws.
  - `startChildOnboarding` throws `RATE_LIMITED` when `hit_rate_limit` returns false and does not create an invitation.
  - `findInvitation(" abcd-efgh ")` hashes the normalised code.
  - `childSignIn` maps `JA423` to `RATE_LIMITED` and never calls `mintChildSession`.
- [ ] **Step 3:** `pnpm test` → FAIL.
- [ ] **Step 4:** Implement. Only `repository.ts` names tables/RPCs. Admin client used only in `child-auth.ts` and the repository functions for `create_invitation`, `hit_rate_limit`, `verify_child_pin`.
- [ ] **Step 5:** `pnpm check` → PASS.
- [ ] **Step 6:** Commit: `feat(family): add family services, dal and child auth`.

---

### Task 7: Parent screens

**Files:**
- Create: `src/features/family/server/actions.ts`, `src/features/family/components/{create-family-form,add-child-form,set-pin-form,child-switcher,family-code-card}.tsx`, `src/app/(app)/parent/{layout,page}.tsx`, `src/app/(app)/parent/setup/page.tsx`, `src/app/(app)/parent/children/new/page.tsx`
- Modify: `src/config/site.ts` (`routes.parent`, `parentSetup`, `parentNewChild`, `child`, `childStart`, `childSignIn`, `invite`; `protectedRoutePrefixes` add `/parent`, `/child`, `/invite`), `src/app/(app)/dashboard/page.tsx` (redirect by role: no membership+parent → `/parent/setup`, parent → `/parent`, child → `/child`), `src/features/auth/schemas.ts` (sign-up rejects emails ending `@child.jarso.invalid`), `src/features/auth/schemas.test.ts`

**Interfaces:**
- Consumes: Task 6 services and DAL.
- Produces: actions `createFamilyAction`, `addChildAction`, `setChildPinAction` (each `createAction` + `assertRole("parent")` / `assertParentOf`, then `refresh()` or `redirect`). `ChildSwitcher` props `{ children: ChildSummary[]; activeChildId?: string }` — used by slices 2–5 with `/parent/[childId]/…` routes.

- [ ] **Step 1:** Test: `signUpSchema` rejects `"x@child.jarso.invalid"` (Review Focus 5). Run → FAIL. Implement → PASS.
- [ ] **Step 2:** Build pages. Setup: currency select (default from `navigator.language` region where it maps to a supported currency, else GBP) and hidden timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone`. Parent home: family code card ("Give this code to your child"), children list with switcher and PIN reset, "Add a child" link, "Accept an invitation" link. Add child: nickname, PIN (numeric input, `inputMode="numeric"`), consent checkbox labelled "I am this child's parent or guardian". Session reads behind `<Suspense>`; layout stays static.
- [ ] **Step 3:** Manual check against local Supabase: sign up parent → setup → add child → family code visible.
- [ ] **Step 4:** `pnpm check && pnpm build` → PASS.
- [ ] **Step 5:** Commit: `feat(family): add parent family screens`.

---

### Task 8: Child-started onboarding and invitation acceptance

**Files:**
- Create: `src/features/family/components/{start-onboarding-form,invite-share-card,accept-invitation-form}.tsx`, `src/app/(auth)/start/page.tsx`, `src/app/invite/page.tsx`
- Modify: `src/features/family/server/actions.ts` (`startChildOnboardingAction`, `acceptInvitationAction`), `src/features/family/index.ts`

**Interfaces:**
- Consumes: `startChildOnboarding`, `findInvitation`, `acceptInvitation`.
- IP for rate limits: first value of `x-forwarded-for` from `headers()`, else `"unknown"`.

- [ ] **Step 1:** `/start` (public): nickname + "Your parent's email". On success show `InviteShareCard`: the link (copy button), the code in large type, and copy: "Show this to your parent. When they say yes, they'll give you your family code and PIN." Email sent if configured. Collect nothing else (invariant 16).
- [ ] **Step 2:** `/invite` (protected, parent): reads `token` from `searchParams` or shows a code field. Unknown/expired/used → "This invitation has expired or was already used. Ask your child to start again." (Review Focus 3). If the parent has no family, link to `/parent/setup?next=/invite?token=…` (use `safeNextPath`). Form: nickname prefilled from the invitation (editable), PIN, consent. Success → `/parent`.
- [ ] **Step 3:** Manual check: start as child in a private window → copy link → sign in as parent → accept → child appears in the list.
- [ ] **Step 4:** `pnpm check && pnpm build` → PASS.
- [ ] **Step 5:** Commit: `feat(family): add child-started onboarding`.

---

### Task 9: Child sign-in and child shell

**Files:**
- Create: `src/features/family/components/child-sign-in-form.tsx`, `src/app/(auth)/sign-in/child/page.tsx`, `src/app/(app)/child/{layout,page}.tsx`
- Modify: `src/features/family/server/actions.ts` (`childSignInAction`), `src/app/(auth)/login/page.tsx` (link "Are you a kid? Sign in here"), `src/lib/supabase/proxy.ts` only if auth-route bounce needs `/sign-in/child` and `/start`

**Interfaces:**
- Consumes: `childSignIn`, `requireRole("child", routes.child)`.

- [ ] **Step 1:** Child sign-in form: family code (auto-uppercase), nickname, PIN. Errors: wrong details → "Hmm, that didn't match. Check with your parent."; locked → the `JA423` copy. Success → `/child`.
- [ ] **Step 2:** Child home placeholder: "Hi, <nickname>!" and a note that jars arrive soon. `requireRole("child")` redirects parents to `/parent`; `/parent` redirects children to `/child` (Review Focus 5).
- [ ] **Step 3:** `pnpm check && pnpm build` → PASS.
- [ ] **Step 4:** Commit: `feat(family): add child pin sign-in`.

---

### Task 10: End-to-end onboarding and docs

**Files:**
- Create: `tests/e2e/onboarding.spec.ts`, `tests/e2e/global-setup.ts` (ensures local Supabase env is present; skips with a clear message otherwise)
- Modify: `playwright.config.ts` (global setup; project `onboarding` requires local Supabase), `docs/auth.md` (child identity, session minting, roles DAL), `docs/api.md` if actions are listed there, `docs/testing.md`, `.github/workflows/ci.yml` (e2e job starts local Supabase and exports env from `supabase status -o env` without printing secrets)

- [ ] **Step 1:** Write `onboarding.spec.ts` with two browser contexts:
  - **Parent-started:** parent signs up (local Supabase: email confirmations disabled in `config.toml` for local only, or confirm via admin in setup) → setup family → add child "Sam" PIN 1234 with consent → read family code → child context signs in with `code.toLowerCase()` + `" sam "` + `1234` → sees "Hi, Sam!".
  - **Child-started:** child context `/start` "Mia" + parent email → reads code → parent context `/invite`, enters the code → PIN 2468 + consent → child signs in → sees "Hi, Mia!". Reopening the same code shows the "expired or was already used" message.
  - **Isolation:** a second parent with their own family sees neither child at `/parent`; child Sam opening `/parent` lands on `/child`.
  - **Lockout:** five wrong PINs → locked message; correct PIN still refused.
- [ ] **Step 2:** `pnpm db:start && pnpm db:reset && pnpm test:e2e` → PASS.
- [ ] **Step 3:** Update docs listed above.
- [ ] **Step 4:** Full verification via the `verify` skill (`pnpm check`, `pnpm build`, `pnpm db:test`, `pnpm test:e2e`). Run the `security-auditor` and `code-reviewer` agents on the branch diff; fix findings.
- [ ] **Step 5:** Commit: `test(e2e): cover both onboarding paths`. Commit `.claude-logs/` separately (`chore: update claude session log`). Open PR `feat(family): family and onboarding`.
