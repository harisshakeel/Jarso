# Network resilience: slow networks, offline actions, no hangs

Date: 2026-10-30. Status: approved in conversation, ready to plan.

## Why

On production, page navigations sat "pending" for 5 to 45 seconds, then all finished at the
same moment (DevTools on `/parent/settings`, `/parent/children/[id]`). Our code isn't what made
them slow: every read path is two to four round trips to Supabase, and every SQL function it
calls is `stable` and takes no lock. But nothing in the app protects against a stalled upstream
call. Supabase fetches have no timeout, so one stuck socket holds a whole render open, and the
UI shows a skeleton forever.

Jarso's users are children on school or home Wi-Fi and parents on mobile data. Both see high
latency and dropped connections often. The app has to stay usable there, and must never leave
behind leaked connections, stale sessions or work that runs on after nobody is waiting for it.

## Goals

1. **Nothing waits forever.** Every server-side network call has a time limit. A slow page
   shows a friendly "taking a while" state with a retry, never an endless skeleton.
2. **Child self-recording works offline.** Diary purchases, mission steps, practice answers and
   check-ins are saved on the device when the network fails and sent automatically when it
   returns. The device keeps them across reloads and closed tabs. Saving needs the app to be
   already open; a cold start with no network is out of scope.
3. **Refusals are visible and kind.** A queued purchase the server later refuses stays in the
   diary as "Needs a look", with a plain reason and three choices: change it, ask a parent, or
   remove it. It never silently disappears and never silently moves money.
4. **Parent and account actions are online-only.** Offline, they show "You're offline, try
   again when connected" and don't send.
5. **Retries never duplicate.** Every action that can be resent (by Next's offline replay, the
   device queue, or a double tap) is safe to repeat.
6. **Sessions don't go stale or get killed by the network.** A burst of concurrent requests
   after a long idle doesn't sign the user out. Sign-out works or says it didn't.
7. **No zombie work.** Long server work (the money guide) has an overall deadline below the
   function's max duration.

## Non-goals

- No moving money offline. The client only records what the user meant to do. Ledger, balances
  and rules stay authoritative on the server.
- No true background sending on iOS. Safari has no Background Sync. The queue sends when the app
  is open, regains focus, or comes back online, on every browser.
- No full offline browsing of pages never visited. Previously visited pages and the prefetched
  App Shell are enough.
- No new infrastructure (Redis, queue broker, a second service). See the `production-readiness`
  skill.
- No realtime/sync engine.

## Anti-goals (failure even if it technically works)

- A child's purchase vanishes, or debits the jar twice.
- A parent confirms a handover twice because a retry went through.
- Copy that blames the child ("invalid", "error", "failed") or uses red alarm styling for a
  normal offline moment.
- A spinner with no end.

## What gets queued vs. what stays online-only

| Action | Offline behaviour |
| --- | --- |
| Record purchase (diary) | Device queue. "Waiting to send" → recorded, or "Needs a look" |
| Mission step, complete mission, practice result, check-in | Device queue. Small "saving…" until sent. Rarely refused; if refused, show the learning screen's existing gentle message |
| Undo purchase | Online-only (it reverses money) |
| Handover, mark not given, gift create/edit/cancel, allowance create/change/pause/resume/stop | Online-only, offline warning |
| Money rules, overspend switch, guide switch | Online-only, offline warning |
| Add/rename/remove child, PIN reset, family settings, invitations | Online-only, offline warning |
| Sign in, sign up, sign out, child sign-in, profile forms | Online-only, offline warning |
| Money guide question | Online-only. The chat input shows the offline warning (it needs Claude live) |

Warning copy (user decision): **"You're offline, try again when connected"**. Calm styling,
not destructive red. The button stays enabled so the user can try again the moment they think
they're back.

## Decided pieces of the how

These were settled in the conversation or follow from the research and codebase. The builder
should treat them as fixed.

### Server: time limits on everything

- One shared `fetchWithTimeout` in `@/lib`, used as `global.fetch` for every Supabase client:
  `lib/supabase/{server,proxy,admin}.ts`. Default about 8 s per call. It combines any caller
  `signal` with `AbortSignal.timeout` and maps a timeout to `AppError("UNAVAILABLE", …)` (add
  the code if missing).
- The proxy's `getClaims()` (and the token refresh it may trigger) uses the same timeout.
- Existing inline timeouts (email `AbortSignal.timeout(10_000)`, Anthropic `TIMEOUT_MS`) move
  onto this helper or stay as they are, at the builder's discretion.

### Server: no zombie work

- The money guide pipeline (`features/guide/server/pipeline.ts`) gets one overall deadline,
  about 45 s, enforced with an `AbortController` shared by every Claude call in the turn. When it
  fires, the turn ends with the guide's existing "break" copy and records nothing half-done.
- `maxDuration` is set explicitly on the guide route segment, and on any page whose actions can
  run long, comfortably above that deadline. This fits Vercel Hobby limits (check the current
  limit in Vercel docs when implementing).

### Retry safety (idempotency)

- `create_gift` gets an idempotency key: a client-generated UUID per form open, stored under a
  unique constraint. A replay returns the existing gift. New migration, per `db-migration`.
- `askGuide` gets a client message id: one UUID per sent question. A replay returns the
  recorded turn instead of calling Claude again or spending rate-limit hits.
- Queued learning actions reuse their existing idempotent RPCs (`record_step_result` PK,
  `record_practice_result` unique per day, `complete_checkin` on conflict, `start_mission`
  returning the open attempt).
- Queued purchases reuse `record_purchase`'s existing key (`purchase-sheet.tsx`, unique
  `ledger_entries.idempotency_key`). The key is created **when the item enters the queue and
  saved with it**, never regenerated on resend.
- Actions that already return "already handled"-style results stay as they are. Actions that
  return a misleading JA409 on a replay (`cancel_gift`, `update_gift`, pause/stop/resume, create
  allowance) are online-only, so replays come only from Next's in-memory retry. The builder
  should make the UI treat "already in that state" as success where that's true.

### Device queue

- IndexedDB-backed outbox in the browser, scoped per signed-in user id. A different user
  signing in on the same device must never send another user's items.
- Each item stores: action name, Zod-valid payload, idempotency key, created-at, attempt count,
  status (`waiting`, `sending`, `sent`, `needs_look`).
- Flush triggers: app start, `online` event, `visibilitychange` to visible, and after any
  successful request. Items send one at a time, in order. No Service Worker or Background Sync
  is required.
- Sending goes through a `withApi` Route Handler under `api/v1` (planner's call), not Server
  Actions: the queue needs real network failures, a client-side abort and timeout, and stable
  URLs across deploys. The handler calls the same feature services, so validation and
  `assertRole` checks are the ones the Server Actions use. Plain `fetch` with
  `AbortSignal.timeout`; a timeout counts as a network failure.
- No tokens in the queue. Replays use the current cookie session. On `UNAUTHORIZED`, pause the
  queue and send the child to sign in. Resume after sign-in as the same user. Items for a
  different user stay parked.
- A refused purchase (`VALIDATION`, overspend, rule block, `FORBIDDEN`) becomes `needs_look`
  with the server's safe message. Network or timeout failures stay `waiting` and retry with
  backoff.
- **Time of action (user decision):** each item carries the time the child did it
  (`occurredAt`, device clock). The server clamps it: never in the future (allow a minute of
  skew), at most 7 days back. It's used for the diary day, spending-limit windows, the undo
  window and learning "today" (check-in, practice day, mission 24 h limit). This needs a
  migration: an optional `p_occurred_at` on `record_purchase` and the learning RPCs, validated in
  SQL, defaulting to `now()` for online calls. Zod payloads gain the field.
- **No cold start offline (user decision):** a child can save actions only while Jarso is
  already open. Opening the app with no network shows the browser's offline page. No Service
  Worker or PWA shell. Saved items send the next time the app loads online.
- **"Ask a parent" is advice only (user decision):** no notification. A "Needs a look" item stays
  until the child changes or removes it.
- Expiry: items older than 7 days, or 20 failed attempts, become `needs_look` with "This one
  waited too long. Add it again?"
- Because the queue uses Route Handlers, Server Action id rotation after a deploy doesn't affect
  it. Online-only forms still use Server Actions; "Failed to find Server Action" there shows a
  "Jarso was updated, refresh to continue" message.

### Client: offline and slow-network UI

- Do **not** turn on Next's `experimental.useOffline` (planner's call). It holds Server Actions
  in memory and sends them again later on its own, which contradicts the user's decision that
  online-only actions must not send late. See
  `node_modules/next/dist/docs/01-app/02-guides/offline-support.md`, "Retry Server Actions
  after the network returns".
- Instead, add a small client `useOnline()` hook: `navigator.onLine` plus `online`/`offline`
  events, also flipped to offline when a request fails on the network. It drives the "You're
  offline" banner in the app shell and gates online-only actions with the warning above.
- Online-only actions get a client wrapper that races the Server Action against a timeout
  (about 15 s) and catches network rejections. Either one shows the offline/slow warning, and
  the form keeps what the user typed. If the server already ran the action, its result is
  idempotent, or it returns an "already handled" result on the next try.
- Add `loading.tsx` and/or Suspense fallbacks that switch to "Taking a while… Try again" after
  about 10 s, with a retry that re-requests the route.
- `error.tsx` handles `UNAVAILABLE` with retry copy instead of the generic error.
- Diary UI shows queued items inline in the purchase list, with the three states. The jar
  balance shown to the child doesn't include waiting items, but the list shows them as
  pending, so the child sees their entry and the honest balance.
- Copy follows `docs/design.md` voice and NN/g rules: say what happened, what to do, no
  blame. Examples:
  - Waiting: "Waiting to send. We'll add it when you're back online."
  - Needs a look: "We couldn't add your snack. Your Spend jar has ₹50 left. Change it, ask a
    parent, or remove it."

### Sessions

- Concurrent refresh after idle: raise `refresh_token_reuse_interval` in production Auth
  settings to cover slow-network bursts (for example 30 s), and stop prefetch storms from
  each triggering a refresh. The builder should look at whether the proxy can skip refresh on
  prefetch requests, or whether Next's partial prefetching already avoids it. Mirror the setting
  in `supabase/config.toml`. Changing the hosted project needs dashboard access, so the plan
  includes it as a runbook step in `docs/deploy.md` (planner's call). The code-side mitigation
  (no refresh on prefetches, request timeouts) ships either way and doesn't depend on it.
- Sign-out: check the result. If it fails on the network, show the offline warning and keep
  the user where they are. The server action still clears cookies locally so the device is
  signed out even if the revoke call didn't reach Supabase.
- Removed or PIN-reset children: today the JWT stays valid for up to an hour, and RLS and
  membership checks still block them. Keep that as is (no extra per-request auth call). The
  queue's `FORBIDDEN` handling covers queued items from a removed child.

### Observability

- Add timing to repository calls through `logger` (duration, name, outcome; no payloads, no
  user data beyond ids). Log at `warn` above a threshold of about 1 s, so the next "45 s
  pending" report has evidence. Never log secrets (`public-repo-security`).

## Constraints

- Follow `CLAUDE.md` hard rules: feature modules, barrels, server/client split, `createAction`,
  Zod, `AppError`, `logger`, env through `src/config`, migrations with RLS, regenerated types.
- Cache Components and partial prefetching stay on.
- Money is integer minor units. Queued purchases carry minor units only.
- Hobby plan on Vercel, about 60 users. Prefer the cheapest version of each concept
  (`production-readiness` skill).
- Public repo: no secrets in code, logs, tests or the queue.

## Left to the builder

- Exact timeout numbers within the ranges above.
- IndexedDB wrapper choice (a tiny hand-rolled one or `idb`), and the outbox module's location.
  It is client-only code, probably `src/features/offline/` or under `src/lib` with a client
  barrel.
- How the "taking a while" state is wired: per-page `loading.tsx` vs. a shared Suspense
  fallback component.
- Whether learning actions show per-step "saving…" or one indicator for the player.
- Backoff schedule for queue retries.
- Test split. Expect unit tests for the outbox state machine and `fetchWithTimeout`, e2e with
  Playwright offline emulation for purchase queue → reconnect → recorded / needs-a-look, and
  offline warning on a parent action. Use `pnpm build && pnpm start` for offline tests.
