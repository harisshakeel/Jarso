# Mobile app wave 2 (rest of the child app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A child can do everything on the phone that they can do on the web: goals, the full diary, Learn (missions, practice, check-in, topics, week), Jarso, News and Me, with offline purchases and learning progress queued and replayed.

**Architecture:** Reads and most writes go straight to Supabase with the child's session, as in wave 1. Learning writes and starts, the guide and its state go through `/api/v1` routes, which accept the phone's bearer token through a request scope that makes `createClient()` and `getCurrentUser()` return the bearer user and client, so web services run unchanged. Copy and composition still inside web move to `@jarso/core` and `@jarso/data`. The phone implements core's outbox ports.

**Tech Stack:** Expo SDK 58 + Expo Router, NativeWind, TanStack Query, supabase-js (+ Realtime), `react-native-svg`, `@react-native-async-storage/async-storage`, `expo-network`, jest-expo + RNTL, Vitest, Maestro, Biome, Turborepo, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-03-mobile-wave-2-design.md` (and wave 1: `2026-11-02-mobile-app-design.md`)

## Global Constraints

- The phone is not trusted. No rule exists only in TypeScript. Learning writes and starts go only through `/api/v1` (server re-grades, checks unlock and finish). Direct calls only to RPCs that check `auth.uid()` / `is_self` / `is_parent_of`.
- No migration. Need for one: stop and raise it.
- No secret in the app bundle. Env read only in `apps/mobile/src/config/env.ts`.
- Web behaviour unchanged; moved code re-exported; web unit and e2e tests stay green; moved copy byte-identical.
- `@jarso/core` / `@jarso/data` purity (CLAUDE.md rule 18). Child copy comes from core, never re-worded in the app.
- Money is integer minor units. Every create sends an `idempotencyKey` (one per sheet opening, `expo-crypto` `randomUUID`); purchases use it as the outbox item id.
- Guide reads on the phone always filter `asked_by is null`.
- Phone-native UI: tabs, sheets, number pad, pull to refresh, safe areas, haptics on success, labels + roles, 44 pt targets.
- `pnpm check` and `pnpm turbo lint typecheck test build` green after every task.
- Never read `.env*`; never print credentials (rule 17).
- Commits: Conventional Commits, one focused change each, subject ≤ ~60 chars, no AI attribution. **Commit steps run only after the user says to commit.**

## Review Focus

1. **Bearer scope leaking between requests.** Two concurrent requests (one bearer, one cookie) must each see only their own user. *(Task 1a test: `concurrent scopes stay isolated`)*
2. **Token expires while an outbox item waits.** The replay gets 401; the queue pauses (`unauthorized`), the session refreshes, and the item sends on the next flush, not dropped. *(Task 3a test: `401 pauses then sends after refresh`)*
3. **Offline detection on the phone.** `expo/fetch` throws `FetchError("fetch failed: …")`, not `TypeError`; it must count as a network failure so items retry instead of being refused. *(Task 1c test: `isNetworkFailure matches expo FetchError`)*
4. **App killed mid-mission.** Reopening resumes at the right step from the server's step results plus queued items, without double-recording a step. *(Task 4a test: `resume after restart skips recorded and queued steps`)*
5. **Realtime after background.** After the app returns to foreground the inbox and badge are fresh (refetch on resubscribe), not stale. *(Task 4c test: `foreground resubscribes and refetches unread`)*

---

## File Structure

```
apps/web/src/lib/supabase/request-scope.ts         NEW  AsyncLocalStorage scope, verifyBearer, runInBearerScope
apps/web/src/lib/supabase/server.ts                MODIFY createClient() returns scoped client when active
apps/web/src/features/auth/server/{session,request-user}.ts  MODIFY scoped user; one token path
apps/web/src/lib/api/index.ts                      MODIFY withApi(handler, { bearer?: true })
apps/web/src/app/api/v1/{outbox,guide/turns}/route.ts        MODIFY bearer: true
apps/web/src/app/api/v1/guide/state/route.ts       NEW
apps/web/src/app/api/v1/learning/start/route.ts    NEW
packages/core/src/{goals,diary,learning,notifications}/copy*.ts  NEW/MODIFY copy + pure helpers moved from web components
packages/core/src/offline/{network,outbox/send}.ts MODIFY Hermes/expo-fetch fixes
packages/core/src/guide/send-turn.ts               MODIFY headers option
packages/data/src/{goals,allowance,learning,notifications,guide}/  NEW shared repositories + composition
apps/mobile/src/lib/outbox/                        NEW  OutboxPlatform (AsyncStorage store, lock, network, bearer)
apps/mobile/src/features/{goals,learn,news,guide,me}/   NEW
apps/mobile/src/features/{jars,diary,history,requests,settings}/  MODIFY
apps/mobile/app/(child)/(tabs)/{index,diary,learn,jarso,news}.tsx  tabs (history → diary)
apps/mobile/e2e/*.yaml                             NEW  Maestro flows
docs/{mobile,api,auth,architecture,testing}.md, docs/adr/0017-bearer-request-scope.md, tasks/todo.md
```

---

### Task 1: web bearer access and core runtime fixes

One SDD task: implement the parts in order, then one review. Each part keeps its own test cycle.

#### 1a: request-scoped bearer auth on the web server

**Files:**
- Create: `apps/web/src/lib/supabase/request-scope.ts`
- Modify: `apps/web/src/lib/supabase/server.ts`, `apps/web/src/features/auth/server/session.ts:15-34`, `apps/web/src/features/auth/server/request-user.ts`, `apps/web/src/lib/api/index.ts` (`withApi`)
- Test: `apps/web/tests/lib/supabase/request-scope.test.ts`, `apps/web/tests/lib/api/with-api-bearer.test.ts`, existing `request-user` and dispatch route tests stay green

**Interfaces:**
- Produces `request-scope.ts` (`import "server-only"`):
  - `verifyBearer(header: string): Promise<SessionUser & { token: string }>`: the token parsing and `getClaims` now in `request-user.ts` (bad/malformed → `AppError("UNAUTHORIZED", "You must be signed in")`; retryable fetch error → `UNAVAILABLE`, "Jarso is taking a while. Please try again.").
  - `runInBearerScope<T>(request: Request, fn: () => Promise<T>): Promise<T>`: no `authorization` header → `fn()` unscoped; header present → verify, build `createSupabaseClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: \`Bearer ${token}\` }, fetch: supabaseFetch }, db: { retry: false } })`, run `fn` inside `AsyncLocalStorage.run({ user, client }, fn)`.
  - `currentScope(): { user: SessionUser; client: SupabaseClient<Database> } | undefined`.
- `createClient()`: `const scope = currentScope(); if (scope) return scope.client;` before reading cookies.
- `getCurrentUser()`: returns `currentScope()?.user` before the cookie path.
- `assertRequestUser(request)`: header → `verifyBearer`, else `assertUser()` (behaviour unchanged).
- `withApi(handler, { crossOrigin?, bearer? })`: with `bearer: true`, wraps the handler call in `runInBearerScope(request, …)`. Without it the header is ignored (cookie path).

- [ ] **Step 1:** Run the `security-auditor` agent on this task's design (paste the Interfaces block). Fold blocking findings into the steps before coding.
- [ ] **Step 2:** Write tests: `no header → createClient uses cookies` (mock `next/headers`); `valid bearer → getCurrentUser returns token sub and createClient returns scoped client`; `malformed header → 401, never cookie path`; `route without bearer:true ignores header → cookie user`; `concurrent scopes stay isolated` (two `runInBearerScope` with different tokens interleaved by awaited timers, each `fn` asserts its own `getCurrentUser().id`).
- [ ] **Step 3:** Run `pnpm --filter @jarso/web test request-scope with-api-bearer`. Expected: FAIL.
- [ ] **Step 4:** Implement. React `cache()` around `getCurrentUser` is per request, so the scope check sits inside it.
- [ ] **Step 5:** Run `pnpm check`. Expected: green, `request-user` and `notices/dispatch` tests unchanged.
- [ ] **Step 6:** Commit (when authorised): `feat(auth): request-scoped bearer auth for api routes`.

#### 1b: bearer on outbox and guide, new state and start routes

**Files:**
- Modify: `apps/web/src/app/api/v1/outbox/route.ts:59` (`assertUser` stays; `withApi(…, { bearer: true })`), `apps/web/src/app/api/v1/guide/turns/route.ts`
- Create: `apps/web/src/app/api/v1/guide/state/route.ts` (GET, `{ data: GuideState }`), `apps/web/src/app/api/v1/learning/start/route.ts` (POST, body parsed with the schema `startMissionAction` uses today (move it to `@jarso/core/learning` if it is web-only), `{ data: { attemptId, resumed } }` exactly what `startMission` returns)
- Modify: `docs/api.md` (four routes, bearer note)
- Test: `apps/web/tests/app/api/v1/{outbox,guide/turns,guide/state,learning/start}/route.test.ts`

**Interfaces:**
- Consumes: Task 1a `withApi(…, { bearer: true })`.
- Produces: `GET /api/v1/guide/state` → `getGuideState(user.id)` after `assertRole("child")`; `POST /api/v1/learning/start` → `startMission(input)`; both rate-limited only by what the services already do.

- [ ] **Step 1:** Tests: each route with a mocked bearer scope returns the service result for that user; outbox with bearer and mismatched `body.userId` → 401 (existing check still runs); guide state for a parent → 403.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(api): bearer access to outbox, guide and mission start`.

#### 1c: core runtime fixes for the phone

**Files:**
- Modify: `packages/core/src/offline/network.ts:6-10`, `packages/core/src/offline/outbox/send.ts:35`, `packages/core/src/guide/send-turn.ts:22-67`
- Test: `packages/core/tests/offline/network.test.ts`, `packages/core/tests/offline/outbox/send.test.ts`, `packages/core/tests/guide/send-turn.test.ts`

**Interfaces:**
- `isNetworkFailure(error: unknown): boolean` additionally true when `error instanceof Error && error.name === "FetchError"` or `/^fetch failed/i.test(error.message)`.
- `sendToServer` timeout via `AbortController` + `setTimeout` (15 s, cleared in `finally`), not `AbortSignal.timeout`.
- `sendGuideTurn(input, opts: { baseUrl?: string; fetch?: typeof fetch; headers?: () => Promise<Record<string, string>> })`: merged into the request headers.

- [ ] **Step 1:** Tests: `isNetworkFailure matches expo FetchError` (`Object.assign(new Error("fetch failed: offline"), { name: "FetchError" })` → true; `new Error("boom")` → false); `send times out after 15s without AbortSignal.timeout` (delete `AbortSignal.timeout`, fake timers, expect `retry`); `sendGuideTurn sends headers()` (fetch spy sees `authorization`).
- [ ] **Step 2:** Run `pnpm --filter @jarso/core test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `fix(core): offline and guide helpers work on Hermes`.

### Task 2: shared copy and data for goals, diary, learning, notices, guide

One SDD task: implement the parts in order, then one review. Each part keeps its own test cycle.

#### 2a: goals and diary copy and data shared

**Files:**
- Create: `packages/core/src/goals/copy.ts`, `packages/data/src/goals/{repository,view,index}.ts`, `packages/data/src/allowance/{repository,index}.ts`
- Modify: `packages/core/src/diary/copy.ts`, `packages/data/package.json` (exports `./goals`, `./allowance`), `apps/web/src/features/goals/server/{repository,service}.ts`, `apps/web/src/features/allowance/server/repository.ts:90`, `apps/web/src/features/goals/components/{goal-sheet,predict-step,goal-staircase,goal-card}.tsx`, `apps/web/src/features/learning/components/home-step-card.tsx`, `apps/web/src/features/diary/components/{received-sheet,fix-form,entry-detail}.tsx`, `apps/web/src/app/(app)/child/goal/page.tsx`
- Test: `packages/core/tests/goals/copy.test.ts`, `packages/core/tests/diary/copy.test.ts`, `packages/data/tests/goals/*.test.ts` (move from `apps/web/tests/features/goals/server/`)

**Interfaces:**
- `@jarso/core/goals`: `PLAN_MESSAGES`, `previewLine(input: { targetMinor; savedMinor; planMinor | null; currency }): string`, `PREDICT_LABEL`, `PREDICT_QUESTION`, `goalCopy` (object of the sheet, card, staircase, new-goal dialog and celebration strings listed in recon, verbatim).
- `@jarso/core/diary`: `fixRefusalMessage(result: FixResult, kind: "purchase" | "received", currency: string): string | null` (null for `fixed`), `receivedCopy`, `entryDetailCopy`, `FALLBACK_LABELS`, `earlierVersions(versions: EntryVersion[], currentId: string): EntryVersion[]` (drops current, newest first).
- `@jarso/data/goals`: `findActiveGoal`, `callGoalProgress`, `callSaveGoal`, `callArchiveGoal`, `callMarkCelebrated` (signatures unchanged), `getGoalView(db: Client, childId: string): Promise<GoalView | null>` (calls `goal_progress` before `findActiveGoal`).
- `@jarso/data/allowance`: `findLatestSchedule(db, childId): Promise<{ amountMinor: number; status: string } | null>` (child-safe columns only).

- [ ] **Step 1:** Move the goal repository tests; write copy tests that pin today's strings (`previewLine` already-saved, no plan, "About 3 more allowances"; `fixRefusalMessage` for each refusal; `earlierVersions` order).
- [ ] **Step 2:** Run `pnpm --filter @jarso/core test && pnpm --filter @jarso/data test`. Expected: FAIL.
- [ ] **Step 3:** Move the code; web components import the copy; web services wrap the shared functions.
- [ ] **Step 4:** Run `pnpm check`. Expected: green; web goal and diary component tests unchanged.
- [ ] **Step 5:** Commit (when authorised), two commits: `refactor(core): share goal and diary copy`, `refactor(data): share goals repository`.

#### 2b: learning and notices data shared

**Files:**
- Create: `packages/data/src/learning/{repository,overview,session,practice,review,index}.ts`, `packages/data/src/notifications/{repository,index}.ts`, `packages/core/src/learning/next-step-copy.ts`, `packages/core/src/notifications/{links,group,time-ago}.ts`
- Modify: `apps/web/src/features/learning/server/{repository,service}.ts`, `apps/web/src/features/review/server/{repository,service}.ts`, `apps/web/src/features/notifications/server/{repository,service}.ts`, `apps/web/src/features/notifications/{links,realtime}.ts`, `apps/web/src/features/notifications/components/{inbox-list,inbox-item}.tsx`, `apps/web/src/features/learning/components/next-step-card.tsx`, `apps/web/src/components/brand/coaches.ts` (text moves to core, web keeps art)
- Test: move `apps/web/tests/features/{learning,review,notifications}/server/*` repository and composition cases to `packages/data/tests/`; core tests for `noticeTarget`, `groupNotices`, `timeAgo`, `describeStep`

**Interfaces:**
- `@jarso/data/learning`: the read functions (`listAttempts`, `findAttempt`, `listStepResults`, `listSkillProgress`, `listReviewItems`, `listPracticeHistory`, `listActivity`, `findLastActivity`, `findCheckIn`, `listRecentPracticeKeys`), plus `getLearningOverview(db, childId, { timezone, now }): Promise<LearningOverview>`, `getMissionSession(db, childId, missionKey, { now }): Promise<MissionSession | null>` (null when locked or unknown), `getPracticeSet(db, childId, { timezone, now })`, `getWeeklyReview(db, childId, { timezone, now })`. Write RPC wrappers stay in web (server only).
- `@jarso/data/notifications`: `listNotices(db, userId, { before?: string, limit = 20 })`, `fetchUnreadCount(db)`, `markRead(db, ids?: string[])`, `toNotice`, `rowToNotice`.
- `@jarso/core/notifications`: `noticeTarget(notice, role): "diary" | "home" | …` (web maps to hrefs), `groupNotices`, `timeAgo(at, now)`.
- `@jarso/core/learning`: `describeStep(step): { title; body; cta }`, coach moment lines.

- [ ] **Step 1:** Move tests, passing `now`/`timezone` explicitly.
- [ ] **Step 2:** Run data and core tests. Expected: FAIL.
- [ ] **Step 3:** Move the code; web services keep `assertRole` + `cache`, then delegate.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised), one per module: `refactor(data): share learning reads`, `refactor(data): share notices repository`.

#### 2c: guide reads shared

**Files:**
- Create: `packages/data/src/guide/{repository,index}.ts`
- Modify: `apps/web/src/features/guide/server/{repository,service}.ts` (re-export the reads; admin-client writes stay)
- Test: `packages/data/tests/guide/repository.test.ts`

**Interfaces:**
- `@jarso/data/guide`: `listMyChats(db, childId)`, `getMyTranscript(db, childId, conversationId)`, `listMemories(db, childId)`, `deleteMemory(db, id)`, `rateMessage(db, messageId, rating)`. Every conversation query applies `.is("asked_by", null)`.

- [ ] **Step 1:** Test: `listMyChats filters asked_by null` and `getMyTranscript of a parent-asked chat → null` (fake client records filters).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Move.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `refactor(data): share guide reads`.

### Task 3: phone outbox, tabs, Home, goals and the rest of the diary

One SDD task: implement the parts in order, then one review. Each part keeps its own test cycle.

#### 3a: phone outbox

**Files:**
- Create: `apps/mobile/src/lib/outbox/{store,platform,sync,index}.ts(x)`
- Modify: `apps/mobile/package.json` (`@react-native-async-storage/async-storage`), `apps/mobile/app/(child)/_layout.tsx` (mount `OutboxSync`), `apps/mobile/src/features/diary/{use-record-purchase,purchase-sheet}.ts(x)` (submit via outbox), `apps/mobile/src/features/settings/settings-screen.tsx` (warn on sign-out when items wait)
- Create: `apps/mobile/src/features/diary/pending-purchases.tsx` (Home card: waiting + "needs a look", web `pending-purchases.tsx`)
- Test: `apps/mobile/tests/lib/outbox/*.test.ts`, `apps/mobile/tests/features/diary/purchase-sheet.test.tsx` (update)

**Interfaces:**
- Consumes: core `OutboxPlatform`, `OutboxStore`, `submitToOutbox`, `flushOutbox`, `useOutbox`-equivalent subscribe; Task 1b bearer outbox.
- Produces: `outboxPlatform: OutboxPlatform` (`headers()` → `{ authorization: Bearer <access token> }` from `supabase.auth.getSession()`), `submit(kind, payload): Promise<SubmitResult>`, `useOutboxItems(userId): OutboxItem[]`, `<OutboxSync />`.
- Purchase sheet results: `sent` → saved view (as now); `queued` → `offlineCopy` queued wording; `refused` → the 409 sentence; `unsaved`/`unsent` → core wording.

- [ ] **Step 1:** Tests: `store keeps items per user oldest first`; `withLock never waits` (second call returns without running); `offline purchase queues then sends on network regain`; `401 pauses then sends after refresh`; `refused purchase becomes needs_look and shows on Home`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/mobile test outbox`. Expected: FAIL.
- [ ] **Step 3:** Implement. `OutboxSync` flushes on `AppState` → active, `Network.addNetworkStateListener` regain, a 30 s interval while active, and a timer for the next due item. After a successful purchase flush: invalidate `home`/`history`, `dispatchNotices()`.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): offline outbox for purchases`.

#### 3b: navigation, Home cards, goals

**Files:**
- Modify: `apps/mobile/app/(child)/(tabs)/_layout.tsx` (tabs Home, Diary, Learn, Jarso, News; Jarso hidden when guide unavailable; News badge), move `history.tsx` → `diary.tsx`, `requests.tsx` and `settings.tsx` → stack screens `app/(child)/requests.tsx`, `app/(child)/me.tsx`; Home header avatar → Me
- Create: `apps/mobile/app/(child)/goal.tsx` (screen), `apps/mobile/app/(child)/goal-sheet.tsx` (form sheet), `apps/mobile/src/features/goals/{use-goal,use-goal-mutations,goal-card,goal-staircase,goal-sheet,predict-step,home-step-card,index}.ts(x)`, `apps/mobile/src/features/jars/jar-graph.tsx`
- Modify: `apps/mobile/src/features/requests/{put-in,take-out}-sheet.tsx` (predict step when a goal exists), `apps/mobile/src/features/jars/home-screen.tsx` (do-this-next, goal card, graph, pending purchases), `apps/mobile/src/lib/query.ts` (keys `goal`, `schedule`, `learning`, `unread`, `notices`, `guideState`, `chats`)
- Test: `apps/mobile/tests/features/goals/*.test.tsx`, `apps/mobile/tests/app/tabs.test.tsx`

**Interfaces:**
- Consumes: Task 2a `@jarso/data/goals`, `@jarso/data/allowance`, core goals copy; Task 2b `getLearningOverview` (for `chooseHomeStep`); `GET /api/v1/guide/state` (Task 1b) via `apiFetch`.
- Produces: `useGoal()`, `useSaveGoal()`, `useArchiveGoal()`, `useMarkCelebrated()` (invalidate `goal`, `home`), `useGuideState()`.

- [ ] **Step 1:** Tests: `no goal shows invitation and opens sheet`; `save goal over allowance shows PLAN_MESSAGES error`; `start a new goal asks to confirm`; `reached goal marks celebrated once`; `tabs hide Jarso when guide off`; `predict step appears in take-out when goal set`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Add `react-native-svg`; implement. Staircase and graph mirror web output from core (`staircaseFor`, graph data from `@jarso/data/ledger`).
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised), two commits: `feat(mobile): child tabs match the web`, `feat(mobile): savings goals and home cards`.

#### 3c: rest of the diary

**Files:**
- Create: `apps/mobile/app/(child)/received.tsx`, `apps/mobile/app/(child)/entry/[entryId].tsx`, `apps/mobile/src/features/diary/{received-sheet,entry-detail,fix-form,earlier-versions,use-record-received,use-fix-entry,use-entry-versions,where-it-went}.ts(x)`
- Modify: `apps/mobile/src/features/history/history-list.tsx:130-215` (row opens entry detail when `canFix || canUndo || fixedFrom`), Home and Diary actions (add "Got money")
- Test: `apps/mobile/tests/features/diary/{received-sheet,entry-detail,fix-form}.test.tsx`

**Interfaces:**
- Consumes: `@jarso/data/diary` `callRecordMoneyReceived`, `callCorrectDiaryEntry`, `callListEntryVersions`; Task 2a diary copy.
- Produces: `useRecordReceived()`, `useFixEntry()` (invalidate + `dispatchNotices()` only on `fixed`), `useEntryVersions(entryId)`.

- [ ] **Step 1:** Tests: `received needs a category before submit`; `Save jar shows the give-cash hint`; `fix unchanged shows unchangedMessage`; `fix not enough spend shows the refusal`; `earlier versions newest first, current hidden`; `row without fix/undo/fixedFrom does not open detail`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement, mirroring `purchase-sheet.tsx` and `sheet-parts.tsx`.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): got money, fix and earlier versions`.

### Task 4: phone Learn, Jarso and News

One SDD task: implement the parts in order, then one review. Each part keeps its own test cycle.

#### 4a: Learn

**Files:**
- Create: `apps/mobile/app/(child)/(tabs)/learn.tsx`, `apps/mobile/app/(child)/learn/{[missionKey],practice,check-in,week,week-question}.tsx`, `apps/mobile/app/(child)/learn/topics/[topicKey].tsx`, `apps/mobile/src/features/learn/{use-learning,use-mission,roadmap,next-step-card,mission-player,step-views,practice,check-in,topic-view,week-card,index}.ts(x)`
- Test: `apps/mobile/tests/features/learn/*.test.tsx`

**Interfaces:**
- Consumes: Task 2b learning reads; `@jarso/core/learning` (`gradeStep`, `resumePosition`, `buildJourney`, `chooseNextStep`, `pickPracticeItems`), `@jarso/core/learning/content`; Task 1b `POST /api/v1/learning/start`; Task 3a `submit("step" | "completeMission" | "practice" | "checkIn", payload)`.
- Produces: `useLearningOverview()`, `useMissionSession(key)`, `useStartMission()`.

- [ ] **Step 1:** Tests: `locked mission routes back to Learn`; `answer graded on device shows right/wrong and queues a step`; `finish only after every step`; `resume after restart skips recorded and queued steps`; `practice all caught up`; `check-in done shows done state`; `topic mode saves nothing`; `familyToday matches node on Hermes` (add `Asia/Kolkata` and `Europe/London` cases to the wave 1 intl parity test).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Read `mission-player.tsx` in full, then implement the phone player (one step per screen, haptic on right).
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): learn roadmap, missions and practice`.

#### 4b: Jarso guide

**Files:**
- Create: `apps/mobile/app/(child)/(tabs)/jarso.tsx`, `apps/mobile/app/(child)/jarso/[conversationId].tsx`, `apps/mobile/app/(child)/guide-sheet.tsx` (step "Help me"), `apps/mobile/src/features/guide/{use-guide,use-send-turn,thread,reply,thinking,intro,memory-list,index}.ts(x)`
- Modify: `apps/mobile/src/features/learn/mission-player.tsx` ("Help me" opens the sheet), Me screen (memories)
- Test: `apps/mobile/tests/features/guide/*.test.tsx`

**Interfaces:**
- Consumes: Task 1c `sendGuideTurn(input, { baseUrl: env.apiUrl, fetch, headers })`; Task 2c guide reads; Task 3b `useGuideState()`.
- Produces: `useSendTurn()` with `clientMessageId` per question (resend reuses it), status lines while streaming, 52 s timeout.

- [ ] **Step 1:** Tests: `question shows as sent while Jarso thinks` (the web fix in `07669a3`; the phone must not repeat the GuideSheet bug); `status lines render then reply`; `retry after timeout reuses clientMessageId`; `chat full shows the web wording`; `rating calls rateMessage`; `memory delete removes it`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): ask Jarso on the phone`.

#### 4c: News

**Files:**
- Create: `apps/mobile/app/(child)/(tabs)/news.tsx`, `apps/mobile/src/features/news/{use-notices,use-unread,notice-listener,inbox-list,index}.ts(x)`
- Modify: tabs layout (badge), `apps/mobile/app/(child)/_layout.tsx` (mount `NoticeListener`)
- Test: `apps/mobile/tests/features/news/*.test.tsx`

**Interfaces:**
- Consumes: Task 2b `@jarso/data/notifications`, core `noticeText`, `noticeTarget`, `groupNotices`, `timeAgo`.
- Produces: `useNotices()` (infinite, 20 per page, `before` cursor), `useUnreadCount()`, `useMarkRead()`.

- [ ] **Step 1:** Tests: `mark all read clears badge`; `opening a notice marks it read and routes by noticeTarget`; `realtime insert shows toast and bumps badge`; `foreground resubscribes and refetches unread`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Channel and filter as web `realtime.ts:35`; unsubscribe on background.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): news inbox with live count`.

### Task 5: Maestro flows, docs and the wave 2 check

**Files:**
- Create: `apps/mobile/e2e/{sign-in,money-loop,diary,goal,learn,news,guide,offline}.yaml`, `docs/adr/0017-bearer-request-scope.md`
- Modify: `apps/mobile/package.json` (`e2e`: `maestro test e2e`), `docs/{mobile,api,auth,architecture,testing}.md`, `CLAUDE.md` (mobile commands), `tasks/todo.md` (wave 2 device check list)

- [ ] **Step 1:** Write flows per spec "Device e2e"; credentials via `${CHILD_FAMILY_CODE}`, `${CHILD_NICKNAME}`, `${CHILD_PIN}` env, never committed.
- [ ] **Step 2:** Run `code-reviewer` and `security-auditor` agents on the branch; fix blocking findings.
- [ ] **Step 3:** Run `pnpm check`, `pnpm turbo lint typecheck test build`, and the `verify` skill. Expected: green.
- [ ] **Step 4:** On a device (user): build with `npx expo run:android`, run `pnpm --filter @jarso/mobile e2e`, tick the wave 2 device list in `tasks/todo.md` (and the still-open wave 1 list).
- [ ] **Step 5:** Commit (when authorised): `test(mobile): maestro flows for the child app`, `docs(mobile): wave 2`.
