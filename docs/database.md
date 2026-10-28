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
| `profiles` | 1:1 with `auth.users`; created by `on_auth_user_created` trigger | owner can select/update |
