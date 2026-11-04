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

## Mobile wave 2 (child parity) — PR #94

Spec `docs/superpowers/specs/2026-11-03-mobile-wave-2-design.md`, plan `docs/superpowers/plans/2026-11-03-mobile-wave-2.md`.

- [x] 1 Web bearer access + core Hermes fixes (plan 1a–1c)
- [x] 2 Shared copy and data: goals, diary, learning, notices, guide (2a–2c)
- [x] 3 Phone outbox, tabs, Home, goals, rest of diary (3a–3c)
- [x] 4 Phone Learn, Jarso, News (4a–4c)
- [x] 5 Maestro flows, docs, wave 2 check (device run below is still open)

### Wave 2 — pending device checks

Build with `npx expo run:android`, then `pnpm --filter @jarso/mobile e2e` (flags in `docs/testing.md`). Unverified so far:

- [ ] Maestro flows pass: sign-in, money-loop, diary, goal, learn, news, guide, offline (selectors are unchecked on a device)
- [ ] Jarso: `expo/fetch` streams the NDJSON reply and the 52 s abort works on Android
- [ ] News: Realtime `setAuth` works with the SecureStore session; a new notice toasts and bumps the badge
- [ ] Offline: a purchase and a practice answer queue, show as waiting, replay on reconnect; a purchase that no longer fits shows "needs a look"
- [ ] Hermes: `Intl` and `familyToday` give the web's day and wording
- [ ] Every row of the spec's screens table works for a test child and the parent sees it on the web
- [ ] Same on an iOS simulator

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
| "I'm a parent" leads to the parent sign-in (wave 3: then Family) | [ ] | [ ] |
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

# Web UI redesign (plan 2026-11-03)

Brief: redesign the web app UI for desktop, laptop and tablet (1280 / 1024 / 768). Kids 10+ first, parents second.
Keep every route, action, API and data flow. Phones are a later phase, but tokens and components must carry over.

## Direction

- **Brand stays.** Teal, gold and cyan come from the jar logo, and the app icon depends on them. Everything else gets brighter and calmer:
  - a cooler, whiter canvas;
  - one section colour per child tab (Home teal, Diary gold, Learn cyan, Jarso violet). Violet is a new scale used only for the AI, never for money;
  - money keeps its rules: Spend is teal, Save is gold, red is never used for money.
- **Type.** Nunito stays. One type scale for child and parent screens (16 px body); the 18 px kid scale was tried and dropped at the user's request (2026-11-03) for consistency.
- **Layout.**
  - From 768 px, a persistent left sidebar with icon and label, 240 px wide from 1024 px and 88 px from 768 px (labels stay, stacked). Below 768 px the current bottom bar stays.
  - The sidebar holds the brand, the nav, and at its foot the signed-in person with their Settings link. This fixes the bug where Settings has no link below 1024 px.
  - Remove the duplicate theme and sign-out controls from the header; they live in Settings.
  - Content sits in a centred `PageContainer` (`narrow` 640 for forms, `default` 1120), headed by a `PageHeader` (back link, eyebrow, title, one primary action).
- **One primary action per screen.** Kid screens use a keycap button. Parent screens use a plain primary button.
- **Parent area.** Neutral and dense: `data-audience="parent"`, a muted "Grown-ups" sidebar tint, multi-column dashboards, and a real table and chart where they help (design.md §10's "never a table" rule is lifted for desktop parents).

## Plan

### P0 Design system (tokens, primitives, docs)
- [~] Tokens: audience scoping, violet scale, section tints, spacing/radius audit, AA re-measure, update `docs/design.md` in the same change (NOTE: tokens.css/ts done; design.md not yet updated)
- [x] Primitives: Button (xl kid size 52 px, `asChild`-style link variant via `buttonVariants`), Card variants (`raised`, `flat`, `tinted`; keep `data-slot=card`)
- [x] New shared components in `components/layout`: PageContainer, PageHeader, BackLink, Section, EmptyState, LoadingState (shimmer), ErrorState, StatTile, DataTable (parent)
- [ ] Replace the 6 copy-pasted keycap `<Link>`s and the 13 repeated text-link class strings with `buttonVariants` / `TextLink`

### P1 Shell
- [x] `AppSidebar` (child and parent item sets, active state, count badge, person footer); bottom bar below 768 px unchanged in behaviour
- [x] `AppHeader` shown only below 768 px; theme and sign-out removed from it
- [x] Keep the nav labels "Main"/"Child"/"Parent" and the tab names e2e relies on

### P2 Child screens
- [x] Home: hero row (greeting, jar shelf, one gold keycap). Then a two-column body: next step and goal on the left, money ride on the right. Goal shown once on Home.
- [ ] Diary: header with balance and action, history table-like list as the main column, Where-it-went side panel
- [ ] Learn hub, mission/check-in/practice/topic/week pages: one player width, unified back links
- [~] Goal, Move my money, News, Me, Jarso (Me done): PageHeader plus at most 2–3 sections each; Me is regrouped into "You", "Looks & sounds" and "Done for now?"

### P3 Parent screens
- [x] Home dashboard (bento): one "Needs you" panel (due, requests, notices merged visually, keeping region names) plus a children overview grouped per child (jars, allowance, this week, latest) with a 2-up chart row
- [ ] Child detail: header with child summary stats; Money tab in two columns (actions | history table); Learning and Jarso tabs fuller
- [ ] Allowance overview as a table; allowance/gift/handover/rules forms in narrow containers with a sticky summary aside on desktop
- [ ] Inbox, Settings (tabs kept; the You tab split into clear groups), setup, add-child, invite

### P4 Auth and system pages
- [ ] Parent and child sign-in, sign-up and start share one split auth layout (art panel plus form card)
- [ ] error, not-found and offline states use the shared EmptyState and ErrorState
- [ ] Marketing landing and privacy/safety pages: tokens only, no restructure (heavily e2e-pinned and outside the app)

### P5 Verify
- [ ] `pnpm check` green (Biome, typecheck, unit tests); update class-pinned unit tests only where the class change is intentional
- [ ] `pnpm build`
- [ ] Visual pass: Playwright screenshots at 1280 / 1024 / 768, light and dark, child and parent (needs local Supabase)
- [ ] Keyboard and reduced-motion pass; axe check on the main screens
- [ ] code-reviewer and test-engineer agents on the diff
- [ ] Review section with what changed, follow-ups and mobile notes

## Constraints (from recon)
- Copy and accessible names are load-bearing for about 20 e2e specs and for the mobile tests, which mirror the web copy. Keep all of them; restructure around them.
- Keep `data-slot` (card, button, button-label, bottom-nav), the `dark` class on `<html>`, and the `data-*` hooks on jar, coach and graph components.
- Class-pinned unit tests: keycap, `bg-teal-100` (unread inbox), `text-ink-2`, `opacity-70`, `fill-gold`, `size-11`.
- Cache Components rule: content reading the session stays inside `<Suspense>`.
- No commits until asked.

## Progress notes (2026-11-03)
- Sidebar brand link renamed "Jarso home" (collided with the Jarso tab; parent-nav test failed).
- Local DB was 10 migrations behind; applied with `supabase migration up --local --include-all`.
- `.shots/dev.mjs` now runs `copy-brand.mjs` (mark icon 404'd without it).
- Jarso chat: the question shows as sent (bubble, box cleared) while Jarso thinks; on failure it goes back in the box. Parent child-picker no longer floats mid-page.
- Child Home fits one screen from 1536 px (three columns, width-fit jars, staircase viewBox cropped to its drawing). 1024–1535 px still scrolls ~130–260 px: follow-up.
- Me regrouped: You | Looks & sounds | What Jarso remembers | Done for now?, two columns from 1024 px; fits one screen at 1920, 1280, 768.
- Jarso corner buddy (`features/guide/components/jarso-buddy.tsx`) on every child page except the Jarso tab, only when Jarso is on: opens the chat in a side sheet. Shelf jars width-fit at every size (fixed phone overflow).
- Parent Home is layout A (picked from 3 mockups): header with Needs-you chip + Add a child, compact money-only child cards (2-up, 3-up from 1536), ?child= switcher, selected child's graph | latest + week. Fits 1920×930 and 1280×800 (switcher in the header, compact JarGraph `size="compact"`, money-only card with allowance on the name row). Replaced the earlier bento: Needs you band, then per child overview/week/graph/latest tiles (2×2 from 1024, 12-col from 1536). Dropped the "This week"/"Children" column headings; e2e region names kept.
- Parent Home tiles adapt to family size: `familyGrid(count, cols)` (features/review) builds grid-template-areas/rows so the selected child's graph/history/week fill the slots the cards leave (1 child: card+history | graph | week). Checked with 1, 2, 3 children at 1920 and 1280.
- GuideSheet ("Help me" beside a step) still adds the question only after the reply: same bug as the thread had. Follow-up.
- Sidebar: Me / Settings tabs removed; the person at the foot of the sidebar ("Me" for a child, "Settings" for a parent) is the one link, lit on that page (`RailLink`, BottomNav `outside`). Learn roadmap sized by screen height from 1024 px (fits from 1280×800; 1024×768 46 px over).
- Flaky under full-suite load: `tests/features/rules/components/rule-group.test.tsx` "adds a rule" (6.3 s > 5 s timeout); passes alone.

# Mobile wave 3 (plans 2026-11-03: type scale, parents on the phone)

Spec `docs/superpowers/specs/2026-11-03-mobile-wave-3-design.md`. Plan 1 (phone type scale) and plan 2 (parents on the phone) are built; card payments and push come in later plans.

## Wave 3 parent device checklist

Build with `npx expo run:android`, then `pnpm --filter @jarso/mobile e2e` with the child and parent `-e` flags (`docs/testing.md`), against `pnpm dev` and the hosted project. Tick each for a test parent on an Android phone; the child sees the results on their phone and the web.

- [ ] Parent signs in with email and password ("I'm a parent") and lands on Family; a child session never reaches a parent screen, a parent never a child one
- [ ] Setup: a parent without details or a family goes to setup, sees only the missing step, and moves on without a loop
- [ ] Family home: Needs you (approve / not now, confirm handover, hand over), Jarso's summary, children rows, the next two weeks
- [ ] Inbox: notices in the parent's wording, unread badge, mark all as read, a notice opens its screen
- [ ] Child hub: jars, requests, due allowance, gifts coming up, allowance card, Jarso card, learning summary, send a note
- [ ] Handover: cash with the Spend · Save split, and mark as not given (card is a later plan)
- [ ] History and where it went
- [ ] Gift: new, edit, cancel
- [ ] Allowance: set up, change, pause, resume, stop
- [ ] Rules
- [ ] Learning (read only)
- [ ] Child's Jarso chats and memories
- [ ] Parent's Jarso chat (the tab shows only when the guide is on); "Do it" on a draft
- [ ] Add a child
- [ ] Settings: names, details, family code, time zone, per child rename, PIN, remove, Jarso access; sign out (also offline)
- [ ] Accept an invitation by code, and by a `jarso://invite?...` link opened while signed out (lands on the invite after sign-in and setup)
- [ ] Maestro parent flows pass: parent-sign-in, parent-approve-request, parent-cash-handover, parent-allowance, parent-add-child (selectors are unchecked on a device)
- [ ] Before/after screenshot of the parent Family home at 360 dp, attached to the PR

## Wave 3 type scale — pending device checks (plan 1 Task 8)

- [ ] Before (on `main`) and after screenshots of Home, Diary and Learn on an Android dev build at 360 dp, kept out of the repo and attached to the PR
- [ ] Home at system font size "Largest": titles and money cap at 1.3x, nothing breaks
- [ ] Maestro child flows pass with the new Home (sign-in, money-loop, diary, goal, learn, news, guide, offline)
- [ ] Nunito's tabular figures line up in the jars card and diary amounts (if not, note it here; `docs/design.md` §3 allows a fallback)

## Wave 3 card payments on the phone — pending device checks (plan 4 Tasks 8–12)

Built and unit-tested; nothing below has run on a device (no device or Android build in the agent's session). Build a development build (`(cd apps/mobile && eas build --profile development --platform android)` or `npx expo run:android`): the Stripe SDK and Razorpay Checkout are native modules, so Expo Go can't run them.

- [ ] Maestro with the fake provider (`pnpm dev` with `PAYMENTS_ALLOW_FAKE=true`, no provider keys): `card-handover-fake`, `card-close-early`
- [ ] Maestro with Stripe test keys and `stripe listen`: `card-handover-stripe`, `card-handover-stripe-3ds`, `save-card`
- [ ] Maestro with Razorpay test keys and a webhook tunnel (INR family): `card-handover-razorpay`, `save-card-razorpay`
- [ ] Stripe 3-D Secure returns to the app through `jarso://stripe-redirect` (the `urlScheme` / `returnURL` the sheet is opened with)
- [ ] Razorpay recurring (saving a card) works on the test account (recurring payments enabled)
- [ ] The ephemeral key's API version (the server's pinned Stripe API version) is accepted by `@stripe/stripe-react-native` 0.81.0
- [ ] `react-native-razorpay` 3.0.0 links and opens under the new architecture on RN 0.88
- [ ] After a card handover the ledger rows match a cash handover, and the child's phone and the web show "Paid by card"
- [ ] Closing the sheet early leaves "Card payment in progress"; after 31 minutes it reads expired, never paid
- [ ] Maestro selectors inside the Stripe and Razorpay sheets (their own UI) are unchecked; fix `e2e/stripe-card.yaml` and `e2e/razorpay-card.yaml` on first run
