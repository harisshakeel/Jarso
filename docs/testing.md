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
| `allowance` | `tests/e2e/allowance.spec.ts` | Local Supabase. Parent sets up, changes, pauses, resumes and stops an allowance; gifts; handover screen |
| `child-home` | `tests/e2e/child-home.spec.ts` | Local Supabase. Child sees jars, allowance and history after a handover |
| `purchases` | `tests/e2e/purchases.spec.ts` | Local Supabase. Parent sets a week spend limit; child records purchases, parent gets a `limit_exceeded` notice, a purchase above Spend is refused until overspend is on, undo restores Spend |
| `offline-purchase` | `tests/e2e/offline-purchase.spec.ts` | Local Supabase. A purchase made offline waits on the device and is recorded on reconnect; a lost reply is resent with the same key and recorded once; a queued purchase above Spend comes back as "Needs a look" with Change it, Ask a parent and Remove |
| `handover-race` | `tests/e2e/handover-race.spec.ts` | Local Supabase, no browser. Parallel `confirm_handover`, `mark_not_given` and `confirm_gift_handover` calls from a signed-in parent: exactly one wins, ledger rows per source are 0 or 2 |
| `guide` | `tests/e2e/guide.spec.ts` | Local Supabase, fake provider (`FEATURE_GUIDE=true`, `GUIDE_PROVIDER=fake` in `playwright.config.ts`). Off until the parent's switch, the intro card, an answer with topic links and a check, a safety reply with helplines, an off-topic redirect, "Help me" in a mission, the parent's flagged-first transcript with the private safety message, switching off |
| `learning` | `tests/e2e/learning.spec.ts` | Local Supabase. Check-in, a full mission with a mistake replayed at the end, leaving and resuming, a locked mission, a topic page with the way back, a due review as practice (made due through the admin client), the parent's learning page and another family kept out |

**How the keys get in, without printing them.** `playwright.config.ts` calls `loadLocalSupabase()` (`tests/e2e/local-supabase.ts`), which runs `pnpm exec supabase status -o json` with stderr dropped, parses stdout in memory and refuses any host other than `127.0.0.1`/`localhost`. It has to run in the config, not `globalSetup`, because Playwright starts the webServer first. The values go to `webServer.env` for both `pnpm build` and `pnpm start`; workers reuse them through a process env var. Never `console.log` them and never run `supabase status` in a way that shows its output.

**Why `.env.local` can't leak in.** `.env.local` points at the hosted project. The webServer gets the local URL and keys explicitly (process env beats `.env` files in Next.js) and `__NEXT_PROCESSED_ENV=true`, which stops Next.js applying `.env*` files at all, so optional keys such as `RESEND_API_KEY` stay unset. The build still prints `Environments: .env.local`; that line only lists files. `reuseExistingServer: false` on the dedicated port means a running dev server is never reused.

**Guards.** `tests/e2e/global-setup.ts` creates a throwaway user on the local stack with the admin API and signs it in through the app; if the server is not on local Supabase that fails and the run aborts. Without local Supabase the `onboarding` project skips with a message (in CI it fails instead). Setting `E2E_BASE_URL` targets an existing server for `smoke` only; `onboarding` skips.

**Rate limits.** No `pnpm db:reset` is needed between runs. Each run uses fresh parent emails (`@example.com`) and families, and sends a random `x-forwarded-for`, so the app's per-IP limits (`pin:ip` 20/15 min, `invite:ip` 5/h) start empty. One run makes 10 PIN attempts, 1 invite and 4 Supabase Auth sign-ups/sign-ins, so GoTrue's local `sign_in_sign_ups` limit (30 per 5 min per IP) allows about seven runs in five minutes.

**CI.** The `e2e` job installs the Supabase CLI (2.122.0, same as `migrations`), runs `supabase start > /dev/null` (stdout carries keys) and then `pnpm test:e2e`.

## Database tests (pgTAP)

- Run `pnpm db:start` then `pnpm db:test` (exits non-zero on failure).
- Each file starts with `begin;` then `\ir _helpers.psql` (works with `supabase test db`), then `select plan(n);`, and ends with `select * from finish(); rollback;`.
- Helpers in `supabase/tests/database/_helpers.psql`: `tests.create_user(email, role)`, `tests.authenticate_as(user_id)`, `tests.clear_auth()`.
- Files: `harness`, `family_core`, `child_accounts`, `child_role`, `invitations`, `list_my_invitations`, `ledger`, `allowance_schedules`, `allowance_generation`, `handover`, `parent_gifts`, `learning_progress`, `guide` and `retry_safety` (all `*.test.sql`).

## Guide evals (on request)

`pnpm eval:guide` (or the **Guide evals** workflow) runs `evals/guide/cases.jsonl`, about 150 cases, through the real pipeline and a Claude judge (`vitest.eval.config.mts`). It needs `ANTHROPIC_API_KEY`, costs about US$3 to $4, and never runs on pull requests. Without a key only the case checks run. The gate: every safety and personal-information case routed correctly, zero FR09 breaks, at least 95% of on-topic answers helpful. The report lands in `evals/guide/results/report.json` (gitignored).
