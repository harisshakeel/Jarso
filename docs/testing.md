# Testing

| Layer | Tool | Location | Command |
| --- | --- | --- | --- |
| Unit / component | Vitest + Testing Library (jsdom) | `apps/web/tests/**/*.test.ts(x)`, mirroring the `apps/web/src/` path (`apps/web/src/features/x/schemas.ts` → `apps/web/tests/features/x/schemas.test.ts`) | `pnpm test` / `pnpm --filter @jarso/web test:watch` |
| Core unit | Vitest (node, no setup file) | `packages/core/tests/<module>/*.test.ts`, mirroring `packages/core/src/` | `pnpm --filter @jarso/core test` |
| End-to-end | Playwright (Chromium) | `apps/web/tests/e2e/*.spec.ts` | `pnpm test:e2e` |
| DB | pgTAP (`pnpm db:test`), plus `supabase db reset` + `supabase db lint` | `supabase/tests/database/*.test.sql`; migrations in `supabase/migrations` | CI `migrations` job |

## What to test

- **Always:** Zod schemas, pure helpers, service logic with branching, security helpers (`safeNextPath`).
- **Components:** behaviour (what the user sees/does), not implementation.
- **E2E:** critical user journeys (auth, core flows) and route protection.
- Don't unit-test Next.js or Supabase themselves.

## Notes

- Pure domain logic (schemas, rules, copy, outbox logic) is tested in `packages/core/tests/<module>/` in the node environment: no jsdom, no `server-only` mock, no browser globals. Core tests import the module under test relatively or by `@jarso/core/<m>`. Web tests cover components, services, repositories and platform adapters (e.g. `webOutboxPlatform`). `pnpm test` runs every package via Turbo.

- `apps/web/tests/setup.ts` mocks `server-only` and loads jest-dom matchers. Public env vars are stubbed in `apps/web/vitest.config.mts`.
- Unit tests live under `apps/web/tests/`, not next to the source. They import the code under test by `@/` alias, including deep paths into a module's internals (`@/features/<f>/server/service`), and mock by the same specifier (`vi.mock("@/features/<f>/server/repository")`). Test-only helpers and fixtures sit beside the tests that use them (`apps/web/tests/features/offline/outbox/test-utils.ts`, `apps/web/tests/lib/payments/stripe/fixtures/`).
- Payments unit tests: `apps/web/tests/lib/payments/` (the shared adapter contract suite `contract.test.ts` runs for fake, Stripe and Razorpay, each with its own test currency; adapter tests with injected SDK client stubs under `stripe/` and `razorpay/`; `registry.test.ts` for which providers are on) and `apps/web/tests/features/payments/` (domain, schemas, status machine). pgTAP: `supabase/tests/database/payments.test.sql`.
- Mock Supabase at the repository boundary when unit-testing services.
- `pnpm test:e2e` builds and starts the app on port 3200. First run: `pnpm --filter @jarso/web exec playwright install chromium`.

## End-to-end against local Supabase

E2E never talks to the hosted project. Run `pnpm db:start`, then `pnpm test:e2e`.

| Project | Spec | Needs |
| --- | --- | --- |
| `smoke` | `apps/web/tests/e2e/smoke.spec.ts` | Nothing (placeholder Supabase env) |
| `onboarding` | `apps/web/tests/e2e/onboarding.spec.ts` | Local Supabase. Parent- and child-started onboarding, family isolation, wrong-role and signed-out redirects, invite reuse, PIN lockout |
| `auth` | `apps/web/tests/e2e/email-confirm.spec.ts` | Local Supabase. Email confirmation link opened in a fresh browser signs in and keeps `next`; a used link lands on login with a message |
| `allowance` | `apps/web/tests/e2e/allowance.spec.ts` | Local Supabase. Parent sets up, changes, pauses, resumes and stops an allowance; gifts; handover screen |
| `child-home` | `apps/web/tests/e2e/child-home.spec.ts` | Local Supabase. Child sees jars, allowance and history after a handover |
| `purchases` | `apps/web/tests/e2e/purchases.spec.ts` | Local Supabase. Parent sets a week spend limit; child records purchases, parent gets a `limit_exceeded` notice, a purchase above Spend is refused until overspend is on, undo restores Spend |
| `offline-purchase` | `apps/web/tests/e2e/offline-purchase.spec.ts` | Local Supabase. A purchase made offline waits on the device and is recorded on reconnect; a lost reply is resent with the same key and recorded once; a queued purchase above Spend comes back as "Needs a look" with Change it, Ask a parent and Remove |
| `offline-mission` | `apps/web/tests/e2e/offline-mission.spec.ts` | Local Supabase. A mission started online is finished offline: each step is graded on the device, the finish screen is built locally, "Saved on this device." shows while results wait, and on reconnect the six steps then the completion arrive in order and Learn shows the mission done |
| `offline-parent` | `apps/web/tests/e2e/offline-parent.spec.ts` | Local Supabase. Online-only parent actions refuse cleanly offline: a handover confirmed offline shows "You're offline, try again when connected" and records nothing, a rename keeps the typed nickname, and sign out offline keeps the user signed in |
| `handover-race` | `apps/web/tests/e2e/handover-race.spec.ts` | Local Supabase, no browser. Parallel `confirm_handover`, `mark_not_given` and `confirm_gift_handover` calls from a signed-in parent: exactly one wins, ledger rows per source are 0 or 2 |
| `requests` | `apps/web/tests/e2e/requests.spec.ts` | Local Supabase. Savings withdrawals and deposits through the screens: ask, approve and hand over, auto-approve and auto-confirm rules, a week cap, asking for more than is available |
| `requests-race` | `apps/web/tests/e2e/requests-race.spec.ts` | Local Supabase, no browser. Five parallel `complete_request` calls hand a withdrawal over once (2 ledger rows); five parallel `create_withdrawal` calls with one key make one request; two approved 500 take-outs against 1000 Save both hand over in parallel, but with Save dropped to 700 neither posts (both `over_available`, nothing partial, Save stays 700); a deposit confirms while a purchase races for the held Spend; `decide_withdrawal` refuses when reserved exceeds Save (a single-call check on a forced state) |
| `guide` | `apps/web/tests/e2e/guide.spec.ts` | Local Supabase, fake provider (`FEATURE_GUIDE=true`, `GUIDE_PROVIDER=fake` in `apps/web/playwright.config.ts`). On by default (the parent's switch starts on), the intro card, a look-up of the child's own jars, an answer with topic links and a check, a safety reply with helplines, an off-topic redirect, "Help me" in a mission, the parent's flagged-first transcript with the private safety message, switching off |
| `payments` | `apps/web/tests/e2e/payments.spec.ts` | Local Supabase, fake provider only (`PAYMENTS_ALLOW_FAKE=true`, `CRON_SECRET` in `apps/web/playwright.config.ts`; no Stripe or Razorpay keys, so the button reads "Pay by card" or "Pay with Test card" and the spec accepts either). Pay by card on the handover screen through the fake hosted page at `/dev/payments/fake` (jars filled, "Paid by card" in history); a card payment finished after a cash handover posts nothing and shows the refund note; auto charge with a saved card that works fills the jars on the cron run; a declining card leaves the allowance due and sends the parent a "didn't go through" notice |
| `learning` | `apps/web/tests/e2e/learning.spec.ts` | Local Supabase. Check-in, a full mission with a mistake replayed at the end, leaving and resuming, a locked mission, a topic page with the way back, a due review as practice (made due through the admin client), the parent's learning page and another family kept out |

**How the keys get in, without printing them.** `apps/web/playwright.config.ts` calls `loadLocalSupabase()` (`apps/web/tests/e2e/local-supabase.ts`), which runs `pnpm exec supabase status -o json` with stderr dropped, parses stdout in memory and refuses any host other than `127.0.0.1`/`localhost`. It has to run in the config, not `globalSetup`, because Playwright starts the webServer first. The values go to `webServer.env` for both `pnpm build` and `pnpm start`; workers reuse them through a process env var. Never `console.log` them and never run `supabase status` in a way that shows its output.

**Why `apps/web/.env.local` can't leak in.** `apps/web/.env.local` points at the hosted project. The webServer gets the local URL and keys explicitly (process env beats `.env` files in Next.js) and `__NEXT_PROCESSED_ENV=true`, which stops Next.js applying `.env*` files at all, so optional keys such as `RESEND_API_KEY` stay unset. The build still prints `Environments: apps/web/.env.local`; that line only lists files. `reuseExistingServer: false` on the dedicated port means a running dev server is never reused.

**Guards.** `apps/web/tests/e2e/global-setup.ts` creates a throwaway user on the local stack with the admin API and signs it in through the app; if the server is not on local Supabase that fails and the run aborts. Without local Supabase the `onboarding` project skips with a message (in CI it fails instead). Setting `E2E_BASE_URL` targets an existing server for `smoke` only; `onboarding` skips.

**Rate limits.** No `pnpm db:reset` is needed between runs. Each run uses fresh parent emails (`@example.com`) and families, and sends a random `x-forwarded-for`, so the app's per-IP limits (`pin:ip` 20/15 min, `invite:ip` 5/h) start empty. One run makes 10 PIN attempts, 1 invite and 4 Supabase Auth sign-ups/sign-ins, so GoTrue's local `sign_in_sign_ups` limit (30 per 5 min per IP) allows about seven runs in five minutes.

**CI.** The `e2e` job installs the Supabase CLI (2.122.0, same as `migrations`), runs `supabase start > /dev/null` (stdout carries keys) and then `pnpm test:e2e`.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`. It is shaped to cost as little time as it can while still running the real checks:

- A first `changes` job reads the diff. Docs, session logs and Claude config run nothing but the secrets scan; the database jobs (`migrations`: a fresh reset, pgTAP, schema lint) run only when `supabase/` or `packages/db/` changed. A push to `main` runs everything.
- `verify` (Biome, commitlint, `turbo typecheck test build --affected`) and `e2e` start together. Both restore caches from the last run: Turbo's task cache, Next's build cache and the Playwright browser.
- A pull request runs one e2e job with only the Playwright projects its changes touch, picked by `scripts/e2e-projects.sh` from the folders in the diff (smoke always runs; a change to the shell, auth, the family, the packages or the database runs the whole suite). A push to `main` runs the whole suite in two shards.
- The e2e job starts the local Supabase stack without Studio, analytics, the edge runtime, the image proxy, storage and the meta API. `supabase/config.toml` raises the local auth rate limits, because the suite signs dozens of users in from the one app-server address within five minutes.
- One retry on CI, a 10 s expectation timeout (5 s locally). Session logs are committed in their own daily PR so feature PRs never conflict on them.

A UI-only pull request takes about two to three minutes; a push to `main` about four to five.

## Database tests (pgTAP)

- Run `pnpm db:start` then `pnpm db:test` (exits non-zero on failure).
- Each file starts with `begin;` then `\ir _helpers.psql` (works with `supabase test db`), then `select plan(n);`, and ends with `select * from finish(); rollback;`.
- Helpers in `supabase/tests/database/_helpers.psql`: `tests.create_user(email, role)`, `tests.authenticate_as(user_id)`, `tests.clear_auth()`.
- Files: `harness`, `family_core`, `child_accounts`, `child_role`, `invitations`, `list_my_invitations`, `ledger`, `allowance_schedules`, `allowance_generation`, `handover`, `parent_gifts`, `learning_progress`, `guide` and `retry_safety` (all `*.test.sql`).

## Guide evals (on request)

`pnpm eval:guide` (or the **Guide evals** workflow) runs `apps/web/evals/guide/cases.jsonl`, about 150 cases, through the real pipeline and a Claude judge (`apps/web/vitest.eval.config.mts`). It needs `ANTHROPIC_API_KEY`, costs about US$3 to $4, and never runs on pull requests. Without a key only the case checks run. The gate: every safety and personal-information case routed correctly, zero FR09 breaks, at least 95% of on-topic answers helpful. The report lands in `apps/web/evals/guide/results/report.json` (gitignored).
