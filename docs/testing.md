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
- `pnpm test:e2e` builds and starts the app on port 3200. First run: `pnpm exec playwright install chromium`.

## End-to-end against local Supabase

E2E never talks to the hosted project. Run `pnpm db:start`, then `pnpm test:e2e`.

| Project | Spec | Needs |
| --- | --- | --- |
| `smoke` | `tests/e2e/smoke.spec.ts` | Nothing (placeholder Supabase env) |
| `onboarding` | `tests/e2e/onboarding.spec.ts` | Local Supabase. Parent- and child-started onboarding, family isolation, wrong-role and signed-out redirects, invite reuse, PIN lockout |
| `auth` | `tests/e2e/email-confirm.spec.ts` | Local Supabase. Email confirmation link opened in a fresh browser signs in and keeps `next`; a used link lands on login with a message |

**How the keys get in, without printing them.** `playwright.config.ts` calls `loadLocalSupabase()` (`tests/e2e/local-supabase.ts`), which runs `pnpm exec supabase status -o json` with stderr dropped, parses stdout in memory and refuses any host other than `127.0.0.1`/`localhost`. It has to run in the config, not `globalSetup`, because Playwright starts the webServer first. The values go to `webServer.env` for both `pnpm build` and `pnpm start`; workers reuse them through a process env var. Never `console.log` them and never run `supabase status` in a way that shows its output.

**Why `.env.local` can't leak in.** `.env.local` points at the hosted project. The webServer gets the local URL and keys explicitly (process env beats `.env` files in Next.js) and `__NEXT_PROCESSED_ENV=true`, which stops Next.js applying `.env*` files at all, so optional keys such as `RESEND_API_KEY` stay unset. The build still prints `Environments: .env.local`; that line only lists files. `reuseExistingServer: false` on the dedicated port means a running dev server is never reused.

**Guards.** `tests/e2e/global-setup.ts` creates a throwaway user on the local stack with the admin API and signs it in through the app; if the server is not on local Supabase that fails and the run aborts. Without local Supabase the `onboarding` project skips with a message (in CI it fails instead). Setting `E2E_BASE_URL` targets an existing server for `smoke` only; `onboarding` skips.

**Rate limits.** No `pnpm db:reset` is needed between runs. Each run uses fresh parent emails (`@example.com`) and families, and sends a random `x-forwarded-for`, so the app's per-IP limits (`pin:ip` 20/15 min, `invite:ip` 5/h) start empty. One run makes 10 PIN attempts, 1 invite and 4 Supabase Auth sign-ups/sign-ins, so GoTrue's local `sign_in_sign_ups` limit (30 per 5 min per IP) allows about seven runs in five minutes.

**CI.** The `e2e` job installs the Supabase CLI (2.122.0, same as `migrations`), runs `supabase start > /dev/null` (stdout carries keys) and then `pnpm test:e2e`.

## Database tests (pgTAP)

- Run `pnpm db:start` then `pnpm db:test` (exits non-zero on failure).
- Each file starts with `begin;` then `\ir _helpers.psql` (works with `supabase test db`), then `select plan(n);`, and ends with `select * from finish(); rollback;`.
- Helpers in `supabase/tests/database/_helpers.psql`: `tests.create_user(email, role)`, `tests.authenticate_as(user_id)`, `tests.clear_auth()`.
