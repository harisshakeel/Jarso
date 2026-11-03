# Foundation scaffold

Stack: Next.js 16 (App Router, Cache Components, `proxy.ts`), TypeScript strict, pnpm,
Tailwind v4 + shadcn/ui, Supabase (`@supabase/ssr`), Zod, Biome, Husky, Vitest, Playwright.

## Plan

- [x] Base Next.js app (create-next-app) moved into repo
- [x] Tooling: Biome, Husky pre-commit, strict tsconfig, scripts
- [x] Env: Zod-validated `env/server.ts` + `env/client.ts`, `.env.example`
- [x] Core lib: errors, action result type, logger, route-handler wrapper, `cn`
- [x] Supabase: browser/server/admin clients, proxy session refresh, typed DB, `supabase/` dir (config, migrations, seed)
- [x] Auth feature module: schemas, server actions, DAL (`getCurrentUser`), login form, callback route, protected `(app)` group
- [x] App shell: root layout, error/not-found/global-error, health API route
- [x] shadcn/ui init + base components
- [x] Tests: Vitest config + sample unit test, Playwright config + smoke test
- [x] CI: GitHub Actions (lint, typecheck, test, build, e2e, migrations)
- [x] Commitlint (commit-msg hook + CI) and Semantic PR title workflow
- [x] Index barrels per module; rule documented
- [x] Domain doc from REQUIREMENTS.md
- [x] Session-log hooks — repo-scoped: `.claude/settings.json` + `.claude/hooks/extract-log.py`
- [x] Project `.claude/settings.json`
- [x] Docs: `docs/` (architecture, conventions, database, auth, testing, ADRs)
- [x] Claude: `CLAUDE.md`, skills, subagents
- [x] Verify: `pnpm lint`, `typecheck`, `test`, `build` all green

## Review

- `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` 12/12 ✅ · `pnpm build` ✅ · Playwright smoke 3/3 ✅ (against prod server, placeholder Supabase env)
- Not verified: migrations against a live local Supabase (Docker not started); CI workflows not yet run on GitHub.

# Slice 1 follow-ups (after PRs #9, #10)

## Blocking
- [x] Add child fails on hosted — resolved 2026-10-29. Root cause was the Vercel deployment missing `SUPABASE_SECRET_KEY`, so `createAdminClient()` threw before GoTrue was called; the `.invalid` domain and password policy were not involved (GoTrue's Admin `createUser` only syntax-checks the email). Key added to Vercel (production + preview, sensitive); add child verified against the hosted project from localhost (parent setup → add child → child PIN sign-in, no errors).

## Should fix
- [x] Password rotation on every PIN sign-in signed the child out of other devices. Fixed: no rotation on sign-in or PIN reset; the `on_auth_child_password_changed` database trigger scrambles any child password, so a self-set one never works.
- [ ] `invite:global` exhaustible by one IP: denied requests still increment. Check global cap only after per-IP/per-email limits pass.

## Hosted setup (user)
- [x] `pnpm db:push` (all 8 migrations applied; `migration list --linked` matches).
- [ ] Confirm-signup email template — blocked on the free tier with the default email provider; needs custom SMTP first (docs/auth.md → Hosted setup).
- [x] Redirect URLs (production + localhost, plain and `**`) — applied via `supabase config push` from `[remotes.production]`.
- [x] "Secure password change" on — applied via config push. Email confirmation temporarily OFF for development (must be on before real families).
- [ ] Delete leftover test users (`smoke…@gmail.com`, `child.jarso`).

## Later
- [ ] Retention cron for expired invitations + old `usage_counters` (slice 2, pg_cron).
- [ ] Deferred minors: orphan auth user on ambiguous create; child sign-out landing; nickname charset rejects combining marks; `nicknameConflict` maps every CONFLICT; 5th wrong PIN copy; `findProfileRole` default; FK `on delete`; DAL unit tests.

# Slice 3 (purchases, limits, undo)

- [x] SQL: notifications, money rules, purchases with overspend rule, undo (pgTAP)
- [x] Server modules: `rules`, `diary` (record, undo), ledger history with purchases and Undone lines
- [x] Screens: child purchase sheet and undo; parent money rules page with overspend switch
- [x] E2E: `tests/e2e/purchases.spec.ts`
- [x] Slice 4: savings deposits and withdrawals as requests (`requests` table, `create_request`, `decide_request`, `complete_request`), withdrawal cap and auto-approve / auto-confirm rules in use, request screens, notices for requests

# Demo 2: inbox, savings goal, jar Home (plan 2026-10-30)

- [x] PR C: in-app inbox and handover reminders (#37)
- [x] Slice 4: savings withdrawals and deposits (#40)
- [x] PR D: personal savings goal (#41)
- [x] PR E: jar Home — JarIllustration, jar scale and next step, child Home around the jars, Diary tab, parent Home with Needs you and mini jars, docs

## Review (PR E)

- `pnpm check`, `pnpm build`, `pnpm db:test` and the full `pnpm test:e2e` green before the PR; results in the PR description.
- Not done here: an axe check (no axe dependency in the repo); the goal-reached moment is unit-tested, not end to end.
- Next: slice 6, demo hardening (demo clock, seed family, full milestone e2e).

# Next set (plan 2026-11-02): cleanup, a11y/perf, demo hardening

Three PRs, in this order. Research done by three Explore agents; claims spot-checked.

## PR A: slice 1 leftovers, retention, slice 2 follow-ups (`fix/…`, one commit per item)

- [x] PIN sign-in stops rotating the password. Done in mobile wave 1 task 7: no rotation on sign-in or reset; a database trigger scrambles any child password.
- [ ] `invite:global` counted only after per-IP and per-email limits pass (`service.ts:138`). Roadmap wrongly says done.
- [ ] Retention job: migration `prune_onboarding_data()` (security definer, `job_runs` row, mirrors `blank_old_guide_text`), daily pg_cron `23 3 * * *`: delete non-accepted invitations expired 30+ days, `usage_counters` windows older than 2 days, expired `guide_memories`. pgTAP test.
- [ ] Orphan auth user: `child-auth.ts` deletes the made-up id best-effort when `createUser` errors.
- [ ] Child sign-out lands on child PIN sign-in, not parent login (`auth/server/actions.ts:84`).
- [ ] Nickname allows combining marks: `\p{M}` in Zod (`family/schemas.ts:15`) + the three SQL checks (register_child, create_invitation, rename) in one migration. Unit + pgTAP.
- [ ] Distinct code for "child account not available" vs nickname taken (`family/server/actions.ts:49`).
- [ ] 5th wrong PIN returns `locked` (SQL), so the child sees the lock copy.
- [ ] `findProfileRole` returns `null` for missing profile; DAL treats it as forbidden. DAL tests for `assertRole`, `assertParentOf`, fallback. NOTE (mobile wave 1): the mobile role gate relies on a missing profile resolving to "parent"; any change must update `apps/mobile/src/features/auth/session-provider.tsx` too.
- [ ] FK `on delete set null` for `family_members.consent_by/approved_by`, `child_credentials.set_by` (drop not null). `families.created_by` and ledger self-refs stay restrict (decision recorded in docs/database.md).
- [ ] Generator timeout: per-schedule `statement_timeout` inside the loop so the run row survives.
- [ ] Date helpers: ledger `localDate` → `localDateOf`; add `formatIsoDate` to `@/lib`, replace 6 copies.
- [ ] Module boundary: move `listOccurrenceAmounts`/`listClosedOccurrences` from ledger repo to allowance. NOTE (mobile wave 1): they now live in `@jarso/data/ledger` and mobile History uses them; this move is superseded unless `@jarso/data` is restructured.
- [ ] Wire orphaned `diary.spec.ts` into a Playwright project (never runs today).
- [ ] Update `docs/roadmap.md`, `docs/fr-audit.md`.

## PR B: accessibility and performance pass (`feat(a11y)…`)

- [ ] Add `@axe-core/playwright`; `a11y.spec.ts` on a `Pixel 5`-class mobile project (360 px), visits every public, child and parent route (signed in via helpers), fails on serious/critical axe violations, both themes.
- [ ] Fix what axe finds; check by hand: mission step inputs label + `aria-describedby` (`step-inputs.tsx`), text equivalent for progress rings, card-returned spinner static under reduced motion, 44 px targets on `roadmap.tsx:155`, `jar-shelf.tsx:207`.
- [ ] Perf: load only the active theme's wordmark (not both eagerly); drop Geist Mono if unused on app pages; delete unused 1–1.4 MB brand PNGs from `public/brand` if nothing references them.
- [ ] Lighthouse mobile run (throttled) on `/`, `/child`, `/child/learn/[mission]`; record scores in `docs/design.md` §11 or a short `docs/perf.md`. No CI gate (manual for ~60 users).
- [ ] Manual low-end-device pass stays with the owner; list what to check.

## PR C: demo hardening, slice 6 (D11) (`feat(demo)…`)

- [ ] Migration: `families.clock_offset interval not null default '0'`, `families.demo_clock_enabled bool default false`; `family_now(family_id)` = `now() + clock_offset`; `family_today` default goes through it.
- [ ] Swap `now()` for `family_now()` in the business-time functions (allowance create/change/pause/resume/stop, confirm_handover, mark_not_given, gifts, requests create/decide/post, withdrawal cap windows, goals celebrate/reach, diary public wrappers, generate/reminders per family). `created_at` stays real time. Infra times (PIN lockout, invites, guide, job_runs) unchanged. pgTAP for offset.
- [ ] `advance_family_clock(days)`: parent of the family, `demo_clock_enabled` required, forward only, then runs generation + reminders for that family. Reset = re-run seed (no backwards time).
- [ ] TS: `FEATURE_DEMO_CLOCK` in `env.server.ts` + `.env.example`; service callers pass family time (`familyToday`, ledger `canUndo`, review, learning, guide today). Parent settings "Demo clock" card only when flag on.
- [ ] Seed: `pnpm db:seed:demo` script (admin API, local or `--linked` with explicit confirm): one demo family, parent + two children, allowance, a goal, some history, `demo_clock_enabled = true`. No real data.
- [ ] Full-milestone e2e (`milestone.spec.ts`, two contexts): onboarding → allowance → advance clock → due badge + reminder → handover → purchase over limit + notice → withdrawal request/approve/handover → deposit confirm.
- [ ] Fill e2e gaps: withdrawal reject, deposit cancel/reject, request notice, push disabled.
- [ ] Acceptance-criteria → test table in `docs/fr-audit.md`.

## Decisions to confirm

1. Demo clock forward only; "reset" = re-seed the family (design doc lists both; backwards time would undo due occurrences).
2. `families.created_by` stays restrict (no parent account deletion in the pilot).
3. Order A → B → C, one PR each, no commits until you say.

# Mobile app wave 1 (plan 2026-11-02)

Spec: `docs/superpowers/specs/2026-11-02-mobile-app-design.md` · Plan: `docs/superpowers/plans/2026-11-02-mobile-wave-1.md`

- [x] 1 `@jarso/data` + requests
- [x] 2 diary + family context
- [x] 3 ledger history composition
- [x] 4 bearer auth helper
- [x] 5 child sign-in token route
- [x] 6 notices dispatch route
- [x] 7 phone + web stay signed in (password guard)
- [x] 8 brand tokens.ts
- [x] 9 Expo skeleton
- [x] 10 session, sign-in, role gate
- [x] 11 Home jars
- [x] 12 purchase + undo
- [x] 13 put in / take out / ask extra
- [x] 14 requests, history, settings
- [x] 15 docs, ADR 0016, done-when check

## Wave 1 — pending device checks

Not run in the build session (no phone or simulator). Tick each on an Android phone and an iOS simulator, against `pnpm dev` (`EXPO_PUBLIC_API_URL` = laptop LAN IP or tunnel) and the hosted project. Push the `child_password_guard` migration first.

| Check | Android | iOS |
| --- | --- | --- |
| Test child signs in with the PIN | [ ] | [ ] |
| Both jars show the right amounts | [ ] | [ ] |
| Log a purchase, Spend drops, undo it | [ ] | [ ] |
| Put money into Save | [ ] | [ ] |
| Take money out: auto-approved case | [ ] | [ ] |
| Take money out: pending case | [ ] | [ ] |
| Ask for extra | [ ] | [ ] |
| Open requests listed; cancel one | [ ] | [ ] |
| Each of the above appears in History | [ ] | [ ] |
| Sign out | [ ] | [ ] |
| Parent sees the requests and notices on the web, and gets the web push | [ ] | [ ] |
| Signing in on the phone keeps the child's web session alive, and the reverse | [ ] | [ ] |
| A child-set password (`updateUser({ password })`) cannot be used to sign in | [ ] | [ ] |
| Wrong PIN shows the web's wording | [ ] | [ ] |
| Five wrong PINs lock that source with the web's wording | [ ] | [ ] |
| "I'm a parent" leads to the "use the web" screen | [ ] | [ ] |
| A non-child session never reaches the child tabs | [ ] | [ ] |
| Intl output looks right on Hermes (money, dates, "x ago") | [ ] | [ ] |
| Web unchanged for users (existing e2e green in CI) | n/a | n/a |

## Review

Run 2026-11-03 without Docker or the hosted DB.

- `pnpm lint`: pass (2 existing Biome warnings, no errors).
- `pnpm typecheck`: pass (7/7 tasks).
- `pnpm test`: pass (10/10 tasks; mobile jest-expo 15 suites, 145 tests).
- `pnpm check`: pass.
- `pnpm turbo build` (web, placeholder public env): pass. `/api/v1/auth/child-sign-in` and `/api/v1/notices/dispatch` are `ƒ`, expected for POST route handlers.
- `npx expo export --platform android`: bundled; `dist/` deleted.
- Not run, CI only: Playwright e2e, pgTAP, `db reset`, `supabase db lint`, `db:types` (need Docker / local Supabase).
- Not run: device walk-through (above), `code-reviewer` and `security-auditor` agents (the controller runs the whole-branch review).
- Before deploy: push `supabase/migrations/20261102200146_child_password_guard.sql` to the hosted DB before or with the web deploy.
