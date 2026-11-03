# Mobile app (Expo), wave 2: the rest of the child app

Date: 2026-11-03. Owner: Pratyush. Follows `2026-11-02-mobile-app-design.md` (wave 1), which sized this wave as: goals, the rest of the diary, missions and practice, notices/inbox, the Jarso guide, an offline outbox, and on-device e2e tests. Everything in the wave 1 spec still holds unless this document says otherwise.

## Why

Wave 1 proved the stack on the child's money loop. Wave 2 finishes the child: when it ships, a child can do everything on the phone that they can do on the web. Parents stay on the web until wave 3.

## Goals

1. **Child parity.** Every child web screen has a phone twin: Home (jars, "do this next" card, goal card, jar graph, pending purchases), Diary (history, got money, fix an entry, earlier versions, undo, where it went), Goal, Requests, Learn (roadmap, missions, practice, check-in, topics, week review), Jarso (chat list, chat thread, step "Help me", memories, rating), News (inbox, mark read, live unread count) and Me (settings).
2. **Same rules, results and copy as the web.** Copy that today lives inside web components moves to `@jarso/core` and both apps use it.
3. **Offline purchases and learning progress queue on the phone** through the existing core outbox engine and replay through `/api/v1/outbox`, exactly as the web does.
4. **Bearer auth works on the `/api/v1` routes the phone needs** (outbox, guide) without rewriting the web services behind them.
5. **No new money rule, no migration.** Rules stay in Postgres and in the existing web services. *(Amended: one migration, `20261103200000_guide_child_reads_own_chats.sql`, was added after the security audit so RLS, not only the app, keeps a parent's guide chat from the child.)*
6. **On-device e2e**: Maestro flows that cover the wave 1 and wave 2 happy paths, run locally against a dev build.
7. Web behaves and deploys exactly as before. `pnpm check` and the turbo pipeline stay green at every commit.

## Non-goals

- Parents on the phone (wave 3), native push (wave 3), the web-push toggle (it subscribes a browser; it has no phone meaning).
- Sounds. The web's sound toggle has no phone twin; haptics already cover feedback (my call).
- Store release, EAS Submit, OTA channels.
- Device e2e in CI. Maestro needs an emulator or a device; CI cost is not worth it at ~60 users (my call, `production-readiness`). Flows run locally and are listed in the wave check.
- Practice money (`ledger_entries.mode = 'practice'`). Nothing writes it on the web either.
- Fixing the known web GuideSheet ordering bug (`tasks/todo.md`). The phone's step sheet must not copy it.

## Anti-goals

- A learning answer graded only on the phone. The phone may grade to show right/wrong at once (as the web client does), but the server re-grades: learning writes go through `/api/v1/outbox`, never straight to `record_step_result`, `complete_mission`, `record_practice_result` or `complete_checkin`.
- A Supabase client or user that leaks from one request into another on the web server.
- A child reading a parent's guide conversation about them on the phone (the web hides it with `asked_by is null`; the shared read keeps that filter).
- Re-worded child copy, or copy duplicated in the app.
- A web regression.

## Decided

From the user: parity is the goal, released in waves; wave 2 is the child; order fixed. "Complete the rest of wave 2": the scope row above, in full.

My calls (each is open to the user's override):

### 1. Request-scoped bearer auth on the web server

Today `assertRequestUser` verifies a bearer token, but every service behind `/api/v1/outbox` and `/api/v1/guide/turns` gets its user from `getCurrentUser()` and its client from `createClient()`, both cookie-bound. Threading a client through every service (and the guide's look-up tools, which call many services) is a large rewrite.

Instead: a request scope.

- New `apps/web/src/lib/supabase/request-scope.ts` (server-only): an `AsyncLocalStorage<{ user: SessionUser; client: SupabaseClient<Database> }>`.
- `withApi(handler, { bearer: true })`: when the request has `Authorization: Bearer <jwt>`, verify it with `getClaims(token)` (as `assertRequestUser` does), build a plain `supabase-js` client with `global.headers.Authorization = Bearer <jwt>`, `persistSession: false`, `autoRefreshToken: false`, and run the handler inside the scope. Without the header the handler runs as today (cookies). A present but bad header is UNAUTHORIZED and never falls back to cookies.
- `createClient()` returns the scoped client when a scope is active; `getCurrentUser()` returns the scoped user. Nothing else changes, so `assertUser`, `assertRole`, `getMembership` and every service work unchanged for bearer callers.
- Only routes that opt in (`bearer: true`) can be entered with a bearer. Pages, Server Actions and other routes never see a scope.
- `assertRequestUser` becomes a thin reader over the same verification code, so there is one token path.
- `security-auditor` reviews it before any route opts in. Tests: scope isolation across concurrent requests, a bad header never falls back to cookies, a route without `bearer: true` ignores the header.

### 2. Which routes the phone uses

Still the wave 1 rule: direct to Supabase with RLS, `/api/v1` only where a server secret or server-side check is needed.

| Route | Why | Change |
|---|---|---|
| `POST /api/v1/outbox` | Server re-grades learning answers, checks mission unlock and finish, and stamps `occurredAt` from `ageMs` | opt into `bearer: true` |
| `POST /api/v1/guide/turns` | Anthropic key, admin-client writes, screens, budget | opt into `bearer: true` |
| `GET /api/v1/guide/state` (new) | `getGuideState` needs `isGuideConfigured()` (server env); returns `{ available, introNeeded }` | new, bearer |
| `POST /api/v1/learning/start` (new) | `startMission` checks the mission exists and is unlocked; the database does not | new, bearer |
| `POST /api/v1/notices/dispatch` | unchanged from wave 1 | none |

Everything else is direct: goals (`save_goal`, `archive_goal`, `mark_goal_celebrated`, `goal_progress`), diary (`record_money_received`, `correct_diary_entry`, `list_entry_versions`), notices (`notifications` select, `mark_notifications_read`, `unread_notification_count`, Realtime), guide reads (conversations and messages with `asked_by is null`, memories select/delete, `rate_guide_message`), learning reads (the six progress tables, select-only by RLS). Recon checked every one: each checks the caller through `auth.uid()`, `is_self` or `is_parent_of`.

Learning *starts* go through `POST /api/v1/learning/start`, which wraps `startMission`; starting is online-only, as on the web (a Server Action there). *(my call)*

### 3. Shared code

- **`@jarso/data` gains** `goals` (repository + `getGoalView(db, childId)`), `allowance` (slim `findLatestSchedule` for the goal sheet's per-allowance limit), `learning` (the read repository functions plus `getLearningOverview`, `getMissionSession` reads, `getPracticeSet`, `getWeeklyReview` gathering, all taking `now`), `notifications` (list with cursor, unread count, mark read, `toNotice`), `guide` (my chats, my transcript with `asked_by is null`, memories, rate). Web repositories re-export them behind `server-only`; web services become wrappers; their tests stay green.
- **`@jarso/core` gains** the copy and pure helpers now inside web components: goals (`PLAN_MESSAGES`, `previewLine`, predict labels and questions, sheet and card copy), diary (received sheet copy, fix refusal mapping `fixRefusalMessage`, entry-detail copy, `FALLBACK_LABELS`, version order helper), learning (`describeStep`, coach moment lines from `components/brand/coaches.ts` that are text only), notices (child `noticeHref` as a target enum, `groupNotices`, `timeAgo`). Web components import them; output is byte-identical.
- **Core runtime fixes** for Hermes / `expo/fetch`: `isNetworkFailure` also matches `expo/fetch`'s `FetchError`; `outbox/send.ts` stops relying on `AbortSignal.timeout` (use the timed-fetch approach); `sendGuideTurn` takes an optional `headers()`.

### 4. Offline outbox on the phone

- Implements core's `OutboxPlatform`: store on `@react-native-async-storage/async-storage` (one key per user, a JSON list, an in-memory listener set for `subscribe`), `withLock` as an in-process try-lock (one JS runtime), `isOffline` from `expo-network`, `fetch` = global `expo/fetch`, `baseUrl = env.apiUrl`, `headers()` returning the bearer from the current session.
- `OutboxSync` flushes on app foreground (`AppState`), on network regain (`expo-network` listener), every 30 s while foreground, and at the next due time.
- Purchases switch from direct `callRecordPurchase` to `submitToOutbox`, so they queue offline, like the web purchase sheet. Undo, requests, goals and fixes stay online-only, as on the web.
- Learning steps, practice, check-in and finish go through the outbox.
- Pending purchases ("needs a look") show on Home, as on the web.
- Items are keyed by user (`listForUser`), as on the web: they stay on the phone after sign-out and replay when that child signs in again. Settings warns before sign-out when items are still waiting. *(my call)*

### 5. Navigation

Mirror the web child nav: tabs **Home, Diary, Learn, Jarso, News** (News shows the unread count). **Requests** and **Me** (settings) are stack screens: Requests from Home's jar actions and the "do this next" card, Me from an avatar button in the Home header. The Jarso tab is hidden when the guide is off; the web's floating buddy has no phone twin because the tab replaces it. *(my call)*

### 6. Live notices

Supabase Realtime on the phone, the same channel and filter as web `notifications/realtime.ts` (`recipient_id=eq.<uid>`), shared through core's `rowToNotice`. A new notice shows a toast, bumps the badge and invalidates the queries it affects. The subscription stops when the app goes to background and resubscribes (and refetches) on foreground.

### 7. Device e2e

Maestro, YAML flows in `apps/mobile/e2e/`, run against a development build (`npx expo run:android`) and the hosted test family. Flows: sign in, purchase + undo, put in, take out, ask extra, cancel request, got money, fix, set a goal, play mission 1, practice, open a notice, ask Jarso a question, offline purchase replays when back online. A `pnpm --filter @jarso/mobile e2e` script runs them. Test credentials come from Maestro env vars set by the developer, never committed.

## Screens and their web sources of truth

| Mobile | Web |
|---|---|
| Home: jars, do-this-next, goal card, jar graph, pending purchases | `app/(app)/child/page.tsx`, `home-step-card.tsx`, `goal-card.tsx`, `jar-graph`, `pending-purchases.tsx` |
| Goal screen and goal sheet, predict step in put-in/take-out | `child/goal/page.tsx`, `goal-sheet.tsx`, `goal-staircase.tsx`, `predict-step.tsx` |
| Diary: history, got money, entry detail (fix, undo, versions), where it went | `child/diary/page.tsx`, `received-sheet.tsx`, `entry-detail.tsx`, `fix-form.tsx`, `where-it-went` card |
| Learn: roadmap, next step, mission player, practice, check-in, topic, week, week question | `child/learn/**`, `mission-player.tsx`, `roadmap.tsx`, `next-step-card.tsx`, `topic-view`, `week-card` |
| Jarso: chats, thread, intro, step "Help me", rating | `child/jarso/page.tsx`, `guide-thread.tsx`, `guide-reply.tsx`, `step-guide.tsx`, `guide-sheet.tsx` |
| News: inbox, mark all read, open a notice | `child/inbox/page.tsx`, `inbox-list.tsx`, `use-open-notice.ts` |
| Me: theme, memories, sign out | `child/settings/page.tsx`, `memory-list.tsx` |

The builder reads each web component before its twin. Behaviour, results, validation and copy match; layout is phone-native (sheets, tab bar, pull to refresh, haptics, 44 pt targets, labels and roles). Charts and the goal staircase use `react-native-svg`.

## Runtime caveats

- `familyToday` uses `Intl.DateTimeFormat` with `timeZone` and `en-CA`: covered by the wave 1 Intl polyfills; add it to the intl parity test.
- `expo/fetch` streams (`ReadableStream` body) on SDK 58, so `sendGuideTurn` works as is with a headers option. The guide does not use `apiFetch` (it buffers).
- Mission content (`@jarso/core/learning/content`, JSON in `packages/content`) is bundled into the app. Answers are already sent to the web client, so this exposes nothing new; the server still re-grades.

## Left to the builder

- Exact versions of `react-native-svg`, AsyncStorage, Maestro.
- File grouping inside each new `@jarso/data` module, query keys, toast component.
- Visual detail inside the brand tokens and `docs/design.md`.

## Done when

- On an Android phone (and an iOS simulator) against local `pnpm dev` and the hosted project, a test child can do every row of the screens table, and the parent sees the results on the web.
- With the network off, a purchase and a practice answer queue, show as waiting, and replay once back online; a purchase that no longer fits shows "needs a look".
- A bearer request to a route without `bearer: true` is treated as signed out; a bad bearer never falls back to cookies; concurrent bearer and cookie requests never see each other's user (test).
- A child never sees a parent's guide conversation about them on the phone.
- Maestro flows pass locally.
- `pnpm check` and CI are green. Web is unchanged for users; its unit and e2e tests pass.
