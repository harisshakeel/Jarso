---
name: db-migration
description: Create or modify Supabase Postgres schema via a migration with RLS policies, indexes and regenerated TypeScript types. Use for any table, column, function, trigger, policy or index change.
---

# Database migration

Rules live in `docs/database.md` — follow them exactly. For non-trivial schema design, consult the `supabase-architect` subagent first.

## Steps

1. `pnpm db:migration <snake_case_description>` → edit the new file in `supabase/migrations/`.
2. Write SQL using this template for a new user-owned table:

   ```sql
   create table public.<table> (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references auth.users (id) on delete cascade,
     -- columns… money as integer minor units: amount_minor bigint not null check (amount_minor >= 0)
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );

   create index <table>_user_id_idx on public.<table> (user_id);

   alter table public.<table> enable row level security;

   create policy "<table>: owner select" on public.<table>
     for select to authenticated using ((select auth.uid()) = user_id);
   create policy "<table>: owner insert" on public.<table>
     for insert to authenticated with check ((select auth.uid()) = user_id);
   create policy "<table>: owner update" on public.<table>
     for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
   create policy "<table>: owner delete" on public.<table>
     for delete to authenticated using ((select auth.uid()) = user_id);

   create trigger <table>_set_updated_at before update on public.<table>
     for each row execute function public.set_updated_at();
   ```

3. Apply locally: `pnpm db:reset` (must succeed from scratch).
4. Lint: `pnpm exec supabase db lint --local --fail-on error`.
5. Types: `pnpm db:types`; fix any TypeScript fallout (`pnpm typecheck`).
6. Update the "Current schema" table in `docs/database.md`.
7. Never edit an already-applied/merged migration — write a new one.

## Checklist

- [ ] RLS enabled + explicit per-operation policies
- [ ] FKs and RLS predicate columns indexed
- [ ] `check` constraints for invariants (non-negative amounts, enums via `check` or Postgres enum)
- [ ] Functions use `set search_path = ''`
- [ ] Destructive change split across two deploys
- [ ] Types regenerated and committed
