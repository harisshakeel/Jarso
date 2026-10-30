# Network Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jarso stays usable on slow and dropping networks. No request waits forever, a child's own activity is saved on the device and sent when the connection returns, parent and account actions refuse cleanly when offline, and retries never duplicate.

**Architecture:** One timed `fetch` for every Supabase client, used on the server and in the proxy, with JA503 mapped to a new `UNAVAILABLE` error. A client-only `features/offline` module holds three things:
- an online signal (`useOnline`);
- an `useOnlineAction` wrapper for online-only Server Actions;
- an IndexedDB outbox that sends child actions one at a time to one `withApi` route, `POST /api/v1/outbox`, which calls the existing feature services.

Three small migrations add the device action time, a gift idempotency key and a guide client message id.

**Tech Stack:** Next.js 16.4 App Router (Cache Components, partial prefetching), Supabase (`@supabase/ssr`, PostgREST RPCs, pgTAP), Zod, Vitest + Testing Library, Playwright, `idb` (new dependency, about 1 kB, wraps IndexedDB), Web Locks API.

**Spec:** `docs/superpowers/specs/2026-10-30-network-resilience-design.md`

## Global Constraints

- Follow every `CLAUDE.md` hard rule: feature modules with barrels, a server barrel starting with `import "server-only"`, route → service → repository layering, `createAction` / `withApi` + `parseBody`, Zod for all input, `AppError` + `logger` (no `console.log`), env only through `src/config`, Biome only.
- Each migration goes through the `db-migration` skill: `pnpm db:migration <name>`, `pnpm db:reset && pnpm db:types`, commit `src/types/database.types.ts`, add pgTAP tests under `supabase/tests/database/`.
- Money is integer minor units. An outbox payload is exactly the feature schema's **input** (for a purchase that's the same `amount` string the form posts), and the route parses it with that same schema, which produces `amountMinor`. There's no second money parser.
- Timeouts:
  - Supabase calls: **8 000 ms**.
  - Online-only actions on the client: **15 000 ms**.
  - Outbox send: **15 000 ms**.
  - Whole guide turn: **45 000 ms**, with guide pages at `maxDuration = 60`.
  - Slow page fallback: **10 000 ms**.
  - Slow call log threshold: **1 000 ms**.
- Outbox:
  - Items expire after **7 days** or **20** failed attempts.
  - Device time: up to **60 s** in the future is accepted and stored as server `now()`. Anything further ahead, or more than **7 days** back, is refused with `22023`.
  - Retry backoff: 2 s, 5 s, 15 s, 30 s, then 60 s (cap).
- Copy is fixed, verbatim:
  - Offline warning: **"You're offline, try again when connected"**.
  - Slow warning: **"This is taking a while. Try again?"**
  - Waiting item: **"Waiting to send. We'll add it when you're back online."**
  - Expired item: **"This one waited too long. Add it again?"**
  - New-deploy message: **"Jarso was updated. Refresh to continue."**
  - `UNAVAILABLE` message: **"Jarso is taking a while. Please try again."**
- Offline states use calm styling (`text-ink-2` / muted surfaces), never destructive red. Error copy never uses "invalid", "error" or "failed" towards a child.
- Logs carry the call name, duration, status and user ids only. Never payloads, labels, message text or keys (`public-repo-security`).
- Do **not** enable `experimental.useOffline`, add a Service Worker, or add a web manifest.
- Commits: Conventional Commits, one logical change each, subject ≤ 60 chars, no AI attribution. Run `pnpm check` before each commit and commit `.claude-logs/` with the work.

## Review Focus

1. **Two tabs flushing at once.** Each item is sent once, because the flush holds a Web Lock and the key is reused. Owning test: Task 6, `flush > two flushers never send the same item concurrently`.
2. **The server committed but the response was lost** (client timeout). The resend with the same key returns the original entry, and the jar is debited once. Owning tests: Task 4 pgTAP `record_purchase replays with same key and backdated time`, and Task 8 e2e `purchase recorded once after a lost response`.
3. **Device clock badly wrong.** More than 60 s ahead or more than 7 days behind: the server refuses with `22023`, and the item becomes "Needs a look", never a silent loss. Owning tests: Task 4 pgTAP clamp cases, and Task 6 `outcome > VALIDATION becomes needs_look`.
4. **A different child signs in on the same device.** The first child's items are neither sent nor shown. Owning test: Task 6, `store > lists and flushes only the current user's items`.
5. **IndexedDB unavailable** (private mode, storage blocked). `submit` reports `unsaved`, the form shows the offline warning and keeps its fields, and nothing is silently dropped. Owning test: Task 6, `submit > returns unsaved when storage cannot open`.

---

### Task 1: Timed Supabase fetch, UNAVAILABLE error, slow-call logs

**Files:**
- Create: `src/lib/timed-fetch.ts`, `src/lib/timed-fetch.test.ts`
- Modify: `src/lib/errors.ts` (add `UNAVAILABLE: 503`), `src/lib/db-error.ts` (map `JA503`), `src/lib/index.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`, `src/lib/supabase/admin.ts`, `src/features/auth/server/session.ts`, `src/proxy.ts`
- Test: `src/lib/timed-fetch.test.ts`, `src/lib/db-error.test.ts`, `src/features/auth/server/session.test.ts` (create if missing)

**Interfaces:**
- Produces:
  - `createTimedFetch(options: { timeoutMs: number; slowMs?: number; name: string }): typeof fetch`. It combines `init.signal` with `AbortSignal.timeout(timeoutMs)` via `AbortSignal.any`. On timeout or a network rejection it rejects with `TimedFetchError` (`code: "JA503"`). If the duration exceeds `slowMs` (default 1000), it logs `logger.warn("Slow upstream call", { name, path, status, durationMs })`, where `path` is the URL pathname only, with no query.
  - `class TimedFetchError extends Error { code: "JA503" }` and `isTimedFetchError(e: unknown): e is TimedFetchError`.
  - `errorCodes.UNAVAILABLE = 503`.
  - `toAppError({ code: "JA503" }, …)` → `AppError("UNAVAILABLE", "Jarso is taking a while. Please try again.")`.
  - `supabaseFetch = createTimedFetch({ timeoutMs: 8000, name: "supabase" })`, exported from `src/lib/timed-fetch.ts` and passed as `global: { fetch: supabaseFetch }` to all three Supabase clients.

- [ ] **Step 1: Write failing tests** in `timed-fetch.test.ts`. Stub `globalThis.fetch` and use fake timers.
  - `rejects with TimedFetchError after timeoutMs`: a stub that never resolves; advance 8000 ms; `await expect(p).rejects.toMatchObject({ code: "JA503" })`.
  - `honours a caller abort signal`: the caller aborts; the rejection is an `AbortError`, **not** `TimedFetchError`.
  - `wraps a network TypeError as TimedFetchError`.
  - `logs a slow call without query string`: a stub resolving after 1200 ms with URL `https://x.supabase.co/rest/v1/rpc/balance?select=*`; `logger.warn` is called with `{ name: "supabase", path: "/rest/v1/rpc/balance", status: 200 }`, and `durationMs >= 1200`.
  - In `db-error.test.ts`: `maps JA503 to UNAVAILABLE` checks `code === "UNAVAILABLE"` and the exact message.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/timed-fetch.test.ts src/lib/db-error.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/timed-fetch.ts`, add the error code and the `JA503` entry in `mapped`, and export from `src/lib/index.ts`. Wire `global: { fetch: supabaseFetch }` into `server.ts`, `proxy.ts` and `admin.ts`.
- [ ] **Step 4: Stop treating an auth timeout as signed out.**
  - In `session.ts`, when `getClaims()` returns an error for which `isAuthRetryableFetchError(error)` (from `@supabase/supabase-js`) is true, or the cause is a `TimedFetchError`, throw `AppError("UNAVAILABLE", …)` instead of returning `null`.
  - In `src/lib/supabase/proxy.ts`, return `{ response, claims, unavailable: boolean }`.
  - In `src/proxy.ts`, when `unavailable` is true, skip the optimistic redirects and return `response`. The DAL decides.
  - Test: `getCurrentUser throws UNAVAILABLE on a retryable auth error`. Mock `createClient` so that `getClaims` resolves `{ data: null, error: new AuthRetryableFetchError("x", 0) }`.
- [ ] **Step 5: Run** `pnpm check`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(lib): time out Supabase calls and log slow ones`.

### Task 2: Guide turn deadline and function duration

**Files:**
- Modify: `src/features/guide/server/pipeline.ts:97-150`, `src/features/guide/server/service.ts` (askGuide), every page under `src/app/(app)/child/**` that renders the guide sheet, plus `src/app/(app)/parent/children/[childId]/guide/**` (add `export const maxDuration = 60`)
- Test: `src/features/guide/server/pipeline.test.ts`

**Interfaces:**
- Consumes: the `GuideProvider` `signal?: AbortSignal` option (`provider.ts:65`).
- Produces: `runGuidePipeline(input, provider, options?: { deadlineMs?: number })`, with `deadlineMs` defaulting to `45_000`. One `AbortSignal.any([AbortSignal.timeout(deadlineMs), internalController.signal])` is passed to **every** provider call: input screen, main reply and output screen. When the deadline fires, it returns the existing fallback result (`route: "unavailable"`, `failed: true`), so the service records it like any other provider failure.

- [ ] **Step 1: Write failing test** `pipeline > ends the turn at the deadline`. Use a fake provider whose `reply` and screens wait until their `signal` aborts. Call with `deadlineMs: 50`. Expect it to resolve within 500 ms with `failed: true` and `route: "unavailable"`, and expect every fake call to have received an aborted signal.
- [ ] **Step 2: Run** `pnpm vitest run src/features/guide/server/pipeline.test.ts`. Expected: FAIL (it times out).
- [ ] **Step 3: Implement** the shared deadline signal. Find the guide pages with `grep -rl "GuideSheet" src/app` and add `export const maxDuration = 60` to each one that can trigger `askGuideAction`. Check the Vercel Hobby limit in Vercel docs and note it in the commit body if it differs.
- [ ] **Step 4: Run** `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(guide): cap a guide turn at 45 seconds`.

### Task 3: Gift and guide idempotency

**Files:**
- Create: migration `pnpm db:migration retry_safe_gift_and_guide`, `supabase/tests/database/retry_safety.test.sql`
- Modify: `src/features/allowance/schemas.ts:81-89` (`giftSchema` gains `idempotencyKey: z.uuid()`), `src/features/allowance/server/{service,repository}.ts` (createGift passes `p_idempotency_key`), `src/features/allowance/components/gift-form.tsx` (one `crypto.randomUUID()` per form mount, hidden input, like `purchase-sheet.tsx:43`), `src/features/guide/schemas.ts:30` (`askGuideSchema` gains `clientMessageId: z.uuid()`), `src/features/guide/server/{service,repository}.ts`, the guide sheet component (one id per sent question, reused when the same question is re-sent after a failure), `src/types/database.types.ts`

**Interfaces:**
- Produces (SQL):
  - `create_gift(p_child_id uuid, p_amount_minor bigint, p_give_on date, p_note text, p_idempotency_key text) returns uuid`.
    - Drop the old 4-argument signature; there's no overload.
    - New column `gifts.idempotency_key text not null`, with `unique (created_by, idempotency_key)`. Backfill existing rows with `gen_random_uuid()::text`.
    - A repeated key from the same parent returns the existing gift id without inserting.
  - `guide_messages.client_message_id uuid null`, with partial `unique (child_id, client_message_id) where client_message_id is not null`.
  - `guide_record_turn(…, p_client_message_id uuid)` stores it on the child row.
  - New `guide_find_turn(p_child_id uuid, p_client_message_id uuid) returns table(conversation_id uuid, reply_id uuid)`: service_role only, like the other `guide_*` admin functions.
- Produces (TS): `askGuide` first calls `repo.findTurn(admin, user.id, clientMessageId)`. On a hit, it returns the stored `AskGuideResult` (load the reply via `listMessages`) **before** any rate-limit hit or provider call.

- [ ] **Step 1: Write failing pgTAP** in `retry_safety.test.sql`:
  - `create_gift twice with one key returns one id and one row`;
  - `same key from a different parent creates a separate gift`;
  - `guide_record_turn rejects a second child row with the same client_message_id` (`23505`);
  - `guide_find_turn returns the recorded turn`.
- [ ] **Step 2: Run** `pnpm db:reset && pnpm db:test`. Expected: FAIL.
- [ ] **Step 3: Write the migration.** RLS is unchanged, since there are no new tables, but repeat the grants for the new signatures. Then run `pnpm db:reset && pnpm db:types`.
- [ ] **Step 4: Write failing unit tests.**
  - `allowance service > createGift forwards the idempotency key`.
  - `guide service > a repeated clientMessageId returns the stored reply without calling the provider or the rate limiter`: the provider and `hitRateLimit` mocks are asserted never called.
- [ ] **Step 5: Implement the TS changes.** Run `pnpm check` and `pnpm db:test`. Expected: PASS.
- [ ] **Step 6: Commit as two commits**, one per concern: `fix(allowance): make creating a gift safe to retry` and `fix(guide): answer a re-sent question once`.

### Task 4: Device action time for queued child actions

**Files:**
- Create: migration `pnpm db:migration device_occurred_at`, new cases in `supabase/tests/database/purchases.test.sql` and the learning pgTAP file
- Modify: `src/features/diary/{schemas.ts,server/service.ts,server/repository.ts}`, `src/features/learning/{schemas.ts,server/service.ts,server/repository.ts}`, `src/types/database.types.ts`

**Interfaces:**
- Produces (SQL), with each `p_occurred_at timestamptz default null`:
  - `record_purchase(p_child_id, p_amount_minor, p_label, p_idempotency_key, p_occurred_at)` → `record_purchase_at(…, public.resolve_occurred_at(p_occurred_at))`.
  - `record_practice_result(p_item_key, p_skill_key, p_correct, p_hints_used, p_tries, p_occurred_at)` uses `family_today` evaluated at the resolved time for its per-day uniqueness.
  - `complete_mission(p_attempt_id, p_occurred_at)` uses the resolved time for `completed_at` and for review scheduling's `v_today`.
  - For all three, drop the old signatures and re-grant to `authenticated`.
  - Internal `resolve_occurred_at(p timestamptz) returns timestamptz`:
    - `null` → `now()`;
    - `p > now() + interval '60 seconds'` or `p < now() - interval '7 days'` → raise `22023`;
    - `p > now()` → `now()`;
    - otherwise `p`.
  - `family_today` needs an "at" form if one doesn't exist. Add `family_day_at(p_family_id uuid, p_at timestamptz) returns date` and keep `family_today` as `family_day_at(…, now())`.
- Produces (TS):
  - `purchaseSchema`, `recordPracticeSchema` and `completeMissionSchema` gain `occurredAt: z.iso.datetime({ offset: true }).optional()`.
  - Services and repositories pass `p_occurred_at: input.occurredAt ?? null`.
  - Online callers send nothing, so their behaviour is unchanged.
- Decision recorded here: `start_mission` stays online-only. It returns the attempt id the player needs, so it can't be queued. `record_step_result` and `complete_checkin` carry no day logic, so they get no time parameter.

- [ ] **Step 1: Write failing pgTAP cases:**
  - `record_purchase with p_occurred_at 2 days ago stores that occurred_at`;
  - `record_purchase 30 s in the future stores now()`;
  - `record_purchase 2 minutes in the future raises 22023`;
  - `record_purchase 8 days ago raises 22023`;
  - `record_purchase replays with same key and backdated time` returns the original entry, with one ledger row;
  - `record_practice_result yesterday counts toward yesterday, not today`;
  - `complete_mission with p_occurred_at sets completed_at`.
- [ ] **Step 2: Run** `pnpm db:reset && pnpm db:test`. Expected: FAIL.
- [ ] **Step 3: Write the migration**, then run `pnpm db:reset && pnpm db:types`.
- [ ] **Step 4: Write failing unit tests:**
  - `diary schemas > accepts an ISO occurredAt and rejects "yesterday"`;
  - `diary service > forwards occurredAt to the RPC`;
  - the same forwarding test for `recordPractice` and `completeMission`.
- [ ] **Step 5: Implement.** Run `pnpm check && pnpm db:test`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(diary): record queued actions at the time they happened`.

### Task 5: Online signal and online-only action wrapper

**Files:**
- Create: `src/features/offline/index.ts` (client barrel), `src/features/offline/use-online.ts`, `src/features/offline/online-action.ts`, `src/features/offline/components/offline-banner.tsx`, `src/features/offline/copy.ts`, plus tests alongside each
- Modify: `src/app/(app)/layout.tsx` (render `<OfflineBanner />` under the header), `src/app/error.tsx` (use the copy below)

**Interfaces:**
- Produces:
  - `offlineCopy` in `copy.ts`: `{ offline, slow, waiting, expired, updated }` with the Global Constraints strings.
  - `useOnline(): boolean`. It's built with `useSyncExternalStore` over a module store, seeded from `navigator.onLine`, updated by `online`/`offline` events and by `reportNetworkFailure()` / `reportNetworkSuccess()`. The server snapshot is `true`.
  - `reportNetworkFailure(): void` and `reportNetworkSuccess(): void`, so other modules can mark the connection.
  - `runOnline<T>(action: () => Promise<ActionResult<T>>, options?: { timeoutMs?: number }): Promise<ActionResult<T>>`. `timeoutMs` defaults to 15 000.
    - If the store says offline, it resolves `{ ok: false, error: { code: "UNAVAILABLE", message: offlineCopy.offline } }` **without calling** the action.
    - A rejection (network) resolves that same failure.
    - On timeout it resolves `{ ok: false, error: { code: "UNAVAILABLE", message: offlineCopy.slow } }`. The underlying promise is left to settle.
    - A rejection whose message contains `"Failed to find Server Action"` resolves `offlineCopy.updated`.
  - `useOnlineActionState<T>(action: (prev: ActionState<T>, payload: FormData) => Promise<ActionResult<T>>)`: the same tuple as `useActionState`, with `runOnline` applied inside.
  - `<OfflineBanner />`: renders `offlineCopy.offline` in a calm `role="status"` bar when `useOnline()` is false, and nothing otherwise.
  - `error.tsx` keeps its structure. The heading becomes "We couldn't load this", the body "Check your connection and try again.", and the button stays "Try again".

- [ ] **Step 1: Write failing tests:**
  - `runOnline > does not call the action when offline`;
  - `runOnline > maps a rejection to the offline copy and reports a network failure`;
  - `runOnline > resolves the slow copy after 15 s` (fake timers);
  - `runOnline > maps "Failed to find Server Action" to the update copy`;
  - `useOnline > flips on offline/online events`;
  - `OfflineBanner > shows the copy only when offline`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/offline`. Expected: FAIL.
- [ ] **Step 3: Implement.** Biome runs on the new module.
- [ ] **Step 4: Run** `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(offline): add an online signal and offline banner`.

### Task 6: Device outbox core

**Files:**
- Create: `src/features/offline/outbox/{types.ts,state.ts,store.ts,flush.ts,submit.ts,use-outbox.ts}`, `src/features/offline/components/outbox-sync.tsx`, and tests `state.test.ts`, `store.test.ts` (with `fake-indexeddb`, a dev dependency), `flush.test.ts`, `submit.test.ts`
- Modify: `src/features/offline/index.ts`, `package.json` (`idb`, plus `fake-indexeddb` as a dev dependency)

**Interfaces:**
- Produces:
  - `type OutboxKind = "purchase" | "practice" | "step" | "completeMission" | "checkIn"`.
  - `type OutboxItem = { id: string; userId: string; kind: OutboxKind; payload: unknown; idempotencyKey: string; occurredAt: string; createdAt: string; attempts: number; nextAttemptAt: string; status: "waiting" | "sending" | "needs_look"; message?: string }`. `id` equals `idempotencyKey` for purchases and is a random uuid otherwise.
  - `type SendOutcome = { kind: "done"; data: unknown } | { kind: "refused"; message: string } | { kind: "retry" } | { kind: "unauthorized" }`.
  - `nextState(item: OutboxItem, outcome: SendOutcome, now: Date): OutboxItem | null`. This is a pure function; `null` means delete.
    - `done` → `null`.
    - `refused` → `needs_look` with the message.
    - `retry` → `attempts + 1`, with `nextAttemptAt` from the backoff in Global Constraints. When `attempts + 1 >= 20` or the item is older than 7 days, it becomes `needs_look` with `offlineCopy.expired`.
    - `unauthorized` → the item is unchanged.
  - `store`: `open(): Promise<Store | null>`, which returns null when IndexedDB is unavailable, plus `put`, `remove`, `listForUser(userId)` and `subscribe(cb)`. Database `jarso-outbox`, store `items`, index `userId`.
  - `flush(userId: string, send: (item: OutboxItem) => Promise<SendOutcome>): Promise<void>`.
    - It runs inside `navigator.locks.request("jarso-outbox:" + userId, { ifAvailable: true }, …)`, so it's a no-op when another tab holds the lock.
    - It sends due `waiting` items oldest first, one at a time, and stops at the first `retry` or `unauthorized`.
  - `sendToServer(item): Promise<SendOutcome>`: `fetch("/api/v1/outbox", { method: "POST", body, signal: AbortSignal.timeout(15000) })`.
    - Network or timeout, or 5xx → `retry`, and calls `reportNetworkFailure()`.
    - 401 → `unauthorized`.
    - Other 4xx → `refused` with the body's `error.message`.
    - 200 → `done`, and calls `reportNetworkSuccess()`.
    - A 200 purchase with `status: "not_enough_spend"` maps to `refused` with the existing purchase-sheet sentence. Move that sentence-building into `src/features/diary/copy.ts` and import it from both places.
  - `submit(input: { userId: string; kind: OutboxKind; payload: unknown; idempotencyKey: string; occurredAt?: string }): Promise<{ status: "sent"; data: unknown } | { status: "queued" } | { status: "refused"; message: string } | { status: "unsaved" }>`. It stores the item **first**, then tries one send immediately, and returns the outcome.
  - `useOutbox(userId: string): OutboxItem[]`, built with `useSyncExternalStore` over the store.
  - `<OutboxSync userId />`: a client component. It calls `flush` on mount, on the `online` event, on `visibilitychange` to visible, every 30 s while items are waiting, and after any `reportNetworkSuccess`. It renders nothing.

- [ ] **Step 1: Write failing tests:**
  - `state > done deletes`;
  - `state > retry backs off 2s, 5s, 15s, 30s, 60s, 60s`;
  - `state > 20th retry becomes needs_look with the expired copy`;
  - `state > older than 7 days becomes needs_look`;
  - `outcome > VALIDATION becomes needs_look` (via `sendToServer` with a mocked 400);
  - `store > lists and flushes only the current user's items`;
  - `flush > two flushers never send the same item concurrently` (two `flush` calls with a shared Web Locks polyfill; `send` is called once per item);
  - `flush > stops at first retry and keeps order`;
  - `flush > unauthorized pauses without changing items`;
  - `submit > stores before sending so a crash mid-send keeps the item`;
  - `submit > returns unsaved when storage cannot open`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/offline/outbox`. Expected: FAIL.
- [ ] **Step 3: Implement.** Use `idb`'s `openDB`. Use a polyfill-free Web Locks call, and fall back to running unlocked when `navigator.locks` is undefined.
- [ ] **Step 4: Run** `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(offline): add a device outbox for child actions`.

### Task 7: Outbox route handler

**Files:**
- Create: `src/app/api/v1/outbox/route.ts`, `src/features/offline/schemas.ts` (isomorphic Zod), `src/app/api/v1/outbox/route.test.ts`
- Modify: `docs/api.md` (document the endpoint)

**Interfaces:**
- Consumes:
  - `recordPurchase` from `@/features/diary/server`;
  - `recordPractice`, `recordStep`, `completeMission`, `completeCheckIn` from `@/features/learning/server`;
  - the feature schemas from their client barrels, with `occurredAt` from Task 4;
  - `getFamilyContext` from `@/features/allowance/server`, for `purchaseSchema(currency)`.
- Produces: `POST /api/v1/outbox` with body `outboxRequestSchema = z.discriminatedUnion("kind", [...])`. Each branch is `{ kind, payload }`, where `payload` is that feature's schema. The response is `json(result)`, the service's return value. It's wrapped in `withApi` (same-origin CSRF guard), and every service already calls `assertRole("child")`. Add `export const maxDuration = 30`.

- [ ] **Step 1: Write failing tests** (mock the services):
  - `routes a purchase to recordPurchase with occurredAt`;
  - `returns 400 for an unknown kind`;
  - `returns 401 when assertRole throws UNAUTHORIZED`;
  - `returns 503 when a service throws UNAVAILABLE`;
  - `rejects a cross-origin POST with 403`.
- [ ] **Step 2: Run** `pnpm vitest run src/app/api/v1/outbox`. Expected: FAIL.
- [ ] **Step 3: Implement** the route, then document it in `docs/api.md`.
- [ ] **Step 4: Run** `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): accept queued child actions at /api/v1/outbox`.

### Task 8: Diary purchases through the outbox

**Files:**
- Modify: `src/features/diary/components/purchase-sheet.tsx`, `src/app/(app)/child/page.tsx` (pass `userId`, render `<PendingPurchases userId currency />` above the recent history), `src/app/(app)/child/layout.tsx` (render `<Suspense fallback={null}><ChildOutboxSync /></Suspense>`, a server component that reads the user and renders `<OutboxSync userId />`)
- Create: `src/features/diary/components/pending-purchases.tsx`, `src/features/diary/components/pending-purchases.test.tsx`, `tests/e2e/offline-purchase.spec.ts`

**Interfaces:**
- Consumes: `submit`, `useOutbox`, `remove` and `offlineCopy` from `@/features/offline`.
- Produces:
  - `PurchaseSheet({ currency, userId })` submits through `submit({ kind: "purchase", payload: { amount, label, idempotencyKey }, idempotencyKey, occurredAt: new Date().toISOString(), userId })`.
    - `sent` + `recorded` → the existing toast "Saved. Nice one." and close, then `router.refresh()`.
    - `sent` + `not_enough_spend` → the existing inline message, and the sheet stays open. The item is deleted, since the child is still there to fix it.
    - `queued` → toast `offlineCopy.waiting` and close.
    - `unsaved` → inline `offlineCopy.offline`, keeping the fields.
  - `PendingPurchases` lists the current user's purchase items.
    - `waiting` shows amount, label and `offlineCopy.waiting`.
    - `needs_look` shows the server message and three actions: **Change it** (opens the sheet prefilled, **with a new key**, and removes the old item on save), **Ask a parent** (shows the advice sentence "Show this to a parent and decide together." and leaves the item in place), and **Remove**.
    - It shows nothing when the list is empty.
  - The Spend jar shown to the child stays the server balance. Pending items are not subtracted.

- [ ] **Step 1: Write failing component tests:**
  - `PendingPurchases > waiting shows the waiting copy`;
  - `needs_look shows message and three actions`;
  - `Remove deletes the item`;
  - `Change it opens the sheet with the old amount`.
- [ ] **Step 2: Write the failing e2e test** in `offline-purchase.spec.ts`, against `pnpm build && pnpm start`, the way Playwright config already runs it:
  - `purchase made offline sends when back online`: set `context.setOffline(true)`, record ₹20, expect "Waiting to send", set `setOffline(false)`, and expect the purchase to appear in history with a Spend balance 20 lower.
  - `purchase recorded once after a lost response`: route `/api/v1/outbox` so the first request reaches the server but the response is aborted (`route.fetch()` then `route.abort()`); after the retry, history shows one entry.
  - `refused queued purchase shows Needs a look`: queue a purchase larger than Spend while offline, reconnect, and expect the message and three buttons.
- [ ] **Step 3: Run** `pnpm vitest run src/features/diary && pnpm test:e2e tests/e2e/offline-purchase.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.** Keep `recordPurchaseAction` for any other caller, or delete it if nothing else uses it (check with `grep`).
- [ ] **Step 5: Run** both commands again. Expected: PASS.
- [ ] **Step 6: Commit** `feat(diary): save purchases offline and send them later`.

### Task 9: Mission player through the outbox

**Files:**
- Modify: `src/features/learning/components/mission-player.tsx` (replace `call()` at :68-77 for step, practice, check-in and complete calls), the learning pages that render `MissionPlayer` (pass `userId`), `src/features/learning/components/mission-player.test.tsx`
- Create: `tests/e2e/offline-mission.spec.ts`

**Interfaces:**
- Consumes: `submit` and `offlineCopy` from `@/features/offline`. `startMissionAction` is wrapped in `runOnline` from Task 5.
- Produces:
  - `MissionPlayer` gains a `userId: string` prop.
  - Step, practice, check-in and complete calls go through `submit`. On `queued`, the player continues using its on-device grading, and shows a small "Saved on this device" note under the progress bar while any item for this user is waiting. On `refused`, it uses the existing `failureText` path. On `unsaved`, it shows `offlineCopy.offline` with a retry.
  - Starting a mission while offline shows `offlineCopy.offline` and doesn't start.
  - The finish screen, after `completeMission`, is built from local state when the result was `queued`.
  - Step results queue in order, since the outbox sends oldest first, so `complete_mission` never arrives before its steps.

- [ ] **Step 1: Write failing tests:**
  - `MissionPlayer > a queued step result advances to the next step`;
  - `shows Saved on this device while items wait`;
  - `starting offline shows the offline copy and does not call startMissionAction`.
- [ ] **Step 2: Write the failing e2e test** `finish a started mission offline, results arrive in order after reconnect`. After reconnecting, the learning page shows the mission completed.
- [ ] **Step 3: Run** `pnpm vitest run src/features/learning/components && pnpm test:e2e tests/e2e/offline-mission.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** both. Expected: PASS.
- [ ] **Step 6: Commit** `feat(learning): keep missions going when the connection drops`.

### Task 10: Online-only forms refuse cleanly offline

**Files:**
- Modify: every client component that calls a Server Action other than those moved in Tasks 8–9. List them with `grep -rlE "useActionState|startTransition\(" src/features src/components`. The expected set includes allowance (handover-form, gift-form, allowance-form, allowance-summary), rules (rule-row, overspend-switch), family (settings form, child list, add-child, invitations), profiles (display-name, parent-details, completion dialog), auth (sign-in, sign-up, child sign-in, sign-out button), guide (guide-switch, guide-sheet) and diary (undo-button).
- Create: `tests/e2e/offline-parent.spec.ts`

**Interfaces:**
- Consumes: `useOnlineActionState` and `runOnline` from Task 5.
- Produces: no new API. Each `useActionState(fn, idle)` becomes `useOnlineActionState(fn)`, and each `startTransition(async () => action(...))` wraps the call in `runOnline`. The existing `FormError` or toast shows `result.error.message`. Forms keep what was typed.

- [ ] **Step 1: Write the failing e2e test:** `parent confirms a handover offline and sees the warning; nothing is recorded after reconnecting`.
  - Go offline, confirm, and expect "You're offline, try again when connected".
  - Go online and wait 5 s. Expect the item to still be due.
  - Confirm again and expect it confirmed once.
  - Also: `sign out offline shows the warning and keeps the user signed in`.
- [ ] **Step 2: Run** `pnpm test:e2e tests/e2e/offline-parent.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Convert the call sites,** one feature at a time. Run `pnpm check` after each feature.
- [ ] **Step 4: Run** the e2e test plus the full `pnpm test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit one commit per feature**, for example `fix(allowance): warn instead of hanging when offline`. That gives 6–7 commits.

### Task 11: Slow page fallback

**Files:**
- Create: `src/components/shell/slow-fallback.tsx`, `src/components/shell/slow-fallback.test.tsx`
- Modify: `src/components/shell/index.ts`, plus the top-level page `<Suspense>` fallbacks for the main tabs: `src/app/(app)/parent/page.tsx`, `parent/settings/page.tsx`, `parent/allowance/page.tsx`, `parent/children/[childId]/page.tsx`, `child/page.tsx`, `child/learn/**/page.tsx`, `child/settings/page.tsx`, `settings/page.tsx`

**Interfaces:**
- Produces: `<SlowFallback after={10_000}>{skeleton}</SlowFallback>`, a client component.
  - It renders `skeleton`, then after `after` ms renders, below it, `offlineCopy.slow` and a **Try again** button that calls `router.refresh()`.
  - It clears its timer on unmount, so there's no zombie timer.
  - Inner `<Suspense>` boundaries inside pages keep their plain skeletons.

- [ ] **Step 1: Write failing tests** (fake timers):
  - `SlowFallback > shows only the skeleton before 10 s`;
  - `shows the slow copy and Try again after 10 s`;
  - `clears its timer on unmount`.
- [ ] **Step 2: Run** `pnpm vitest run src/components/shell/slow-fallback.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement,** then swap the fallbacks listed above.
- [ ] **Step 4: Run** `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(shell): offer a retry when a page is slow`.

### Task 12: Sessions — sign-out and refresh reuse window

**Files:**
- Modify: `src/features/auth/server/actions.ts:55-59`, `supabase/config.toml:166-175` (`refresh_token_reuse_interval = 30`), `docs/deploy.md` (runbook step), `docs/auth.md` (one paragraph on sessions over slow networks)
- Test: `src/features/auth/server/actions.test.ts`

**Interfaces:**
- Produces:
  - `signOut` calls `supabase.auth.signOut()` and, if it returns an error, logs `logger.warn("Sign-out revoke failed", { code })`.
  - It **always** redirects to login. auth-js removes the local session even when the revoke request fails, so the device is signed out either way. The offline case is stopped earlier, on the client, by Task 10's `runOnline`.
- Decision recorded here: the proxy stays as is for prefetch requests. Skipping refresh there would push refreshes into Server Components, which can't write cookies, and would lose rotated tokens. Concurrent refreshes are covered by the 30 s reuse interval together with the 8 s timeouts from Task 1.
- Runbook text for `docs/deploy.md`: "Supabase → Authentication → Sessions → Refresh token reuse interval: 30 seconds. Set by someone with dashboard access. It needs no deploy and takes effect immediately."

- [ ] **Step 1: Write failing test:** `signOut > logs and still redirects when the revoke call errors`. Mock `signOut` resolving `{ error: new AuthRetryableFetchError("x", 0) }`; expect `logger.warn` and a `redirect(routes.login)`.
- [ ] **Step 2: Run** `pnpm vitest run src/features/auth/server/actions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement,** update `config.toml`, and write both doc changes.
- [ ] **Step 4: Run** `pnpm check && pnpm db:reset`. Expected: PASS.
- [ ] **Step 5: Commit as two commits:** `fix(auth): log a failed sign-out revoke` and `docs(deploy): raise the refresh token reuse window`.

### Task 13: Final verification

- [ ] **Step 1:** Run the `verify` skill: Biome, typecheck, unit tests, build, e2e and DB reset. Expected: all green.
- [ ] **Step 2:** Manual check on `pnpm build && pnpm start` with Chrome DevTools throttled to "3G" and then "Offline":
  - Navigate Home → Allowance → Settings, and confirm no request stays pending past 10 s without the slow copy.
  - Record a purchase offline, reload the tab, go online, and confirm it sends.
- [ ] **Step 3:** Add a "Network resilience" section to `docs/architecture.md`: timeouts, outbox, what's online-only, and the link to the spec. Commit with `docs: describe network resilience`.
