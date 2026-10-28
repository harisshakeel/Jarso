# 0002. Supabase for database and auth

- Status: Accepted
- Date: 2026-10-28

## Context

Need managed Postgres, auth, and storage with minimal ops.

## Decision

Supabase. Schema via SQL migrations in-repo (`supabase/`), generated TypeScript types, `@supabase/ssr` cookie sessions. Every `public` table has RLS; app code uses the user-scoped client by default and the secret-key admin client only for trusted server jobs.

## Consequences

- Authorization is enforced in the database even if app code is wrong.
- Local dev requires Docker (`supabase start`).
- RLS policies must be written and reviewed with care; performance depends on indexing policy columns.
