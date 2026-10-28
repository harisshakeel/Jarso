# Testing

| Layer | Tool | Location | Command |
| --- | --- | --- | --- |
| Unit / component | Vitest + Testing Library (jsdom) | colocated `src/**/*.test.ts(x)` | `pnpm test` / `pnpm test:watch` |
| End-to-end | Playwright (Chromium) | `tests/e2e/*.spec.ts` | `pnpm test:e2e` |
| DB | pgTAP (`pnpm db:test`), plus `supabase db reset` + `supabase db lint` | `supabase/tests/database/*.test.sql`; migrations in `supabase/migrations` | CI `migrations` job |

## What to test

- **Always:** Zod schemas, pure helpers, service logic with branching, security helpers (`safeNextPath`).
- **Components:** behaviour (what the user sees/does), not implementation.
- **E2E:** critical user journeys (auth, core flows) and route protection.
- Don't unit-test Next.js or Supabase themselves.

## Notes

- `tests/setup.ts` mocks `server-only` and loads jest-dom matchers. Public env vars are stubbed in `vitest.config.mts`.
- Mock Supabase at the repository boundary when unit-testing services.
- `pnpm test:e2e` builds and starts the app. Set `E2E_BASE_URL` to target an already-running server. First run: `pnpm exec playwright install chromium`.
- E2E tests needing a signed-in user should run against local Supabase (`pnpm db:start`) and create users via the admin client in a setup project.

## Database tests (pgTAP)

- Run `pnpm db:start` then `pnpm db:test` (exits non-zero on failure).
- Each file starts with `begin;` then `\ir _helpers.psql` (works with `supabase test db`), then `select plan(n);`, and ends with `select * from finish(); rollback;`.
- Helpers in `supabase/tests/database/_helpers.psql`: `tests.create_user(email, role)`, `tests.authenticate_as(user_id)`, `tests.clear_auth()`.
