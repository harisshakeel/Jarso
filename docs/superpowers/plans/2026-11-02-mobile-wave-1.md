# Mobile app wave 1 (child money loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone, a child signs in with a PIN, sees the Spend and Save jars, logs and undoes a purchase, puts money into Save, takes money out, asks for extra, manages open requests, reads History and signs out. The rules, results and copy are the same as on the web.

**Architecture:** A new Expo app (`apps/mobile`) talks to Supabase directly with the child's session, so RLS and the existing Postgres functions enforce every rule. A new shared `@jarso/data` package holds the repositories and query-level composition that web and mobile both call. Web keeps thin wrappers over it. Only two things go through new Next routes: child PIN sign-in (it needs the admin client and rate limits) and push dispatch. Cross-device sign-out is fixed by rotating the child's password only on PIN reset, with a new guard against a password the child sets themselves.

**Tech Stack:** Expo (latest stable SDK) + Expo Router, React Native, NativeWind + react-native-reusables, TanStack Query, supabase-js + expo-secure-store, jest-expo + React Native Testing Library, Vitest (core, data, web), Biome, Turborepo, pnpm.

**Spec:** `docs/superpowers/specs/2026-11-02-mobile-app-design.md`

## Global Constraints

- The phone is not trusted. No money rule exists only in TypeScript. Every wave 1 mutation is an existing Postgres function that checks `auth.uid()` through `is_self` or `is_parent_of`.
- No secret in the app bundle. The app reads only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_API_URL`, and only in `apps/mobile/src/config/env.ts`.
- Web behaviour is unchanged. Existing web unit and e2e tests stay green. Web feature barrels and call sites keep their names: moved code is re-exported.
- `@jarso/data` follows the same purity rules as core: no React, Next, `server-only`, `@supabase/ssr`, `idb` or platform globals. Biome enforces this.
- Child copy comes from `@jarso/core` and is never re-worded in the app.
- Money is integer minor units end to end.
- Every request create sends an `idempotencyKey`: one per sheet opening, from `randomUUID` (`expo-crypto` on mobile).
- `pnpm check` and `pnpm turbo lint typecheck test build` stay green after every task.
- No migration, except the child-password guard in Task 7 (and only if the auth hook isn't available).
- Never read `.env*`. Never print or paste credentials (CLAUDE.md rule 17). Use placeholders like `sb_publishable_…`.
- Commits follow Conventional Commits, one focused change each, with a subject of at most ~60 chars and no AI attribution. **Commit steps run only after the user has said to commit.** Until then, leave the changes staged-ready and move on.
- Phone-native UI: bottom tab bar, sheets for actions, number pad for money and PIN, pull to refresh on Home, History and Requests, safe areas, light haptics on success. Every control has an accessibility label and role, and touch targets are at least 44 pt.
- Wave 1 runs against local `pnpm dev`, reached from the phone over the LAN or a tunnel, and the hosted Supabase project.

## Review Focus

1. **Expired or revoked session mid-use.** The refresh fails, for example after a PIN reset. The app must clear the session and land on the PIN screen with a calm message, not loop or show a raw error. *(Task 10 test: `signs out to the PIN screen when refresh fails`)*
2. **Double tap or retry after a timeout on a money action.** It must produce exactly one purchase or request. *(Task 12 and Task 13 tests: the same `idempotencyKey` is reused for a retry within one sheet opening, and a new key comes with a new opening)*
3. **Offline or no route to the laptop.** Every action shows the web's offline wording and doesn't pretend to succeed. *(Task 10 test on `apiFetch` and the `toUserMessage` mapping of network errors)*
4. **A non-child session.** A parent token, or a profile that can't be read, must never reach the child tabs. *(Task 10 test: `parent role signs out and shows the parents screen`)*
5. **Locale formatting on Hermes.** Amounts in the family currency, and "x minutes ago" or dates in the family timezone, must match the web's output. *(Task 9 test: `intl parity`, the same outputs as core's node tests for INR, GBP, USD and EUR plus a non-UTC timezone)*

---

## File Structure

```
packages/data/                         NEW  @jarso/data: repositories + query composition (client injected)
  package.json  tsconfig.json  vitest.config.mts
  src/requests/{repository,availability,index}.ts
  src/diary/{repository,undo,index}.ts
  src/ledger/{repository,history,jars,index}.ts
  src/family/{repository,context,index}.ts
  tests/<module>/*.test.ts
packages/core/src/requests/messages.ts NEW  depositMessage, withdrawalMessage, emergencyMessage (moved from web sheets)
packages/brand/tokens.ts               NEW  JS tokens for NativeWind; tests/tokens.test.ts parity with tokens.css
apps/web/src/features/{requests,diary,ledger,family}/server/  MODIFY  re-export from @jarso/data; services become thin
apps/web/src/features/auth/server/request-user.ts             NEW  assertRequestUser(request)
apps/web/src/features/family/server/{child-auth,service}.ts   MODIFY  token minting; rotation only on PIN reset
apps/web/src/app/api/v1/auth/child-sign-in/route.ts           NEW
apps/web/src/app/api/v1/notices/dispatch/route.ts             NEW
apps/mobile/                           NEW  Expo app (structure in spec, "App structure")
docs/{mobile,architecture,api,auth,testing}.md, docs/adr/0016-*.md, CLAUDE.md
```

---

### Task 1: `@jarso/data` package with requests

**Files:**
- Create: `packages/data/{package.json,tsconfig.json,vitest.config.mts}`, `packages/data/src/requests/{repository.ts,availability.ts,index.ts}`
- Create: `packages/core/src/requests/messages.ts` (and export it from `packages/core/src/requests/index.ts`)
- Modify: `apps/web/src/features/requests/server/repository.ts` (becomes a re-export, keeps `import "server-only"`), `apps/web/src/features/requests/server/service.ts:49-62`, `apps/web/src/features/requests/components/{put-in,take-out,ask-extra}-sheet.tsx` (import the messages from core), `apps/web/next.config.ts` (`transpilePackages` += `@jarso/data`), `apps/web/package.json`, `biome.json` (add `packages/data/**` to the core purity override at line 80), `turbo.json` if packages need listing
- Test: `packages/data/tests/requests/{repository,availability}.test.ts` (move the matching cases from `apps/web/tests/features/requests/server/`), `packages/core/tests/requests/messages.test.ts`

**Interfaces:**
- Produces: `@jarso/data/requests` exports every function now in `apps/web/src/features/requests/server/repository.ts` with **unchanged signatures**: `fetchBalances`, `fetchCapRemaining`, `listRequestsFor`, `listOpenRequests`, `findRequestChildId`, `callCreateWithdrawal`, `callCreateEmergency`, `callCreateDeposit`, `callDecideWithdrawal`, `callDecideDeposit`, `callComplete`, `callCancel`, and `type Balances`, `type Client = SupabaseClient<Database>`.
- Produces: `getAvailability(db: Client, childId: string): Promise<Availability>`, the body of today's web `getAvailability` without the auth check (`takeOutLimitMinor = capRemaining === null ? null : Math.min(availableSaveMinor, capRemaining)`).
- Produces: `@jarso/core/requests` exports `depositMessage(result: DepositResult, currency: string): string`, `withdrawalMessage(result: WithdrawalResult, currency: string): string` and `emergencyMessage(result: EmergencyResult, currency: string): string`, copied verbatim from the web sheets (`put-in-sheet.tsx:75-87`, `take-out-sheet.tsx:90-100` and the ask-extra equivalent).

- [ ] **Step 1:** Scaffold `packages/data`. Copy the layout of `packages/core/package.json` and its `tsconfig.json` (extends `@jarso/tsconfig/library.json`). Exports `"./requests": "./src/requests/index.ts"`. Dependencies: `@jarso/core`, `@jarso/db`, `@supabase/supabase-js` and `zod` (workspace and versions as in web). Scripts: `typecheck`, `test`.
- [ ] **Step 2:** `git mv` the web requests repository tests into `packages/data/tests/requests/` and point their imports at `@jarso/data/requests`. Add `availability.test.ts` with these cases: `cap null → takeOutLimitMinor null`; `cap 500, availableSave 300 → 300`; `cap 200, availableSave 300 → 200`. Use a fake client that returns fixed rpc data, the same pattern as the moved tests.
- [ ] **Step 3:** Run `pnpm --filter @jarso/data test`. Expected: FAIL, the module is not found.
- [ ] **Step 4:** Move the repository body to `packages/data/src/requests/repository.ts`. Swap `@/lib` for `@jarso/core/lib` and `@/types` for `@jarso/db`, and drop `server-only`. Add `availability.ts`. The web `repository.ts` becomes `import "server-only"; export * from "@jarso/data/requests";`, and the web `getAvailability` keeps `cache` + `assertSelfOrParentOf` and then calls the shared one.
- [ ] **Step 5:** Move the three message functions to `packages/core/src/requests/messages.ts`, import them back in the sheets, and move their tests into `packages/core/tests/requests/messages.test.ts` (or write them: one assertion per status, with the strings verbatim).
- [ ] **Step 6:** Run `pnpm check` and `pnpm turbo typecheck test build`. Expected: all green, and the web requests tests still pass.
- [ ] **Step 7:** Commit (when authorised): `refactor(data): share requests repository via @jarso/data`.

### Task 2: diary and family context in `@jarso/data`

**Files:**
- Create: `packages/data/src/diary/{repository.ts,undo.ts,index.ts}`, `packages/data/src/family/{repository.ts,context.ts,index.ts}`
- Modify: `apps/web/src/features/diary/server/{repository.ts,service.ts:61-70}`, `apps/web/src/features/family/server/repository.ts` (re-export only the moved functions; leave admin-only ones such as `verifyChildPin` and `revokeUserSessions` in web), `apps/web/src/features/allowance/server/service.ts:59-68`, `packages/data/package.json` (exports)
- Test: `packages/data/tests/diary/*.test.ts`, `packages/data/tests/family/context.test.ts`

**Interfaces:**
- Produces `@jarso/data/diary`: `callRecordPurchase`, `callRecordMoneyReceived`, `callUndoDiaryEntry`, `callCorrectDiaryEntry`, `callListEntryVersions` (signatures unchanged), and `undoEntry(db: Client, entryId: string): Promise<UndoResult>`, which throws `AppError("CONFLICT", "You can only undo within a day.")` on `too_late`.
- Produces `@jarso/data/family`: `findMembership`, `findProfileRole`, `findNickname`, `findFamilyById` (unchanged), and `getFamilyContext(db: Client, userId: string, now?: Date): Promise<FamilyContext>`. It throws `AppError("FORBIDDEN", "Set up your family first.")` when there is no membership. `today` is `familyToday(timezone)` from `@jarso/core/lib`.

- [ ] **Step 1:** Move the diary and family repository tests. Add `undo.test.ts` (`too_late → throws CONFLICT "You can only undo within a day."`, `undone → returns undone`) and `context.test.ts` (`no membership → FORBIDDEN`; `family with Asia/Kolkata → { currency, timezone, today }`).
- [ ] **Step 2:** Run `pnpm --filter @jarso/data test`. Expected: FAIL.
- [ ] **Step 3:** Move the code the same way as in Task 1. The web `undoDiaryEntry` becomes `assertUser()` + `undoEntry`. The web `getFamilyContext` becomes `assertUser()` + the shared one.
- [ ] **Step 4:** Run `pnpm check` and `pnpm turbo typecheck test build`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `refactor(data): share diary and family reads`.

### Task 3: ledger, jars and history composition in `@jarso/data`

**Files:**
- Create: `packages/data/src/ledger/{repository.ts,history.ts,jars.ts,index.ts}`
- Modify: `apps/web/src/features/ledger/server/{repository.ts,service.ts}`. `getJars` and `getHistoryPage` become auth + delegate. `groupBySource`, `diaryItem`, `requestItems`, `localDate`, `UNDO_WINDOW_MS`, `FIX_WINDOW_MS`, `HISTORY_LIMIT` and `ROW_LIMIT` move.
- Test: move `apps/web/tests/features/ledger/server/*` cases for history and jars to `packages/data/tests/ledger/`

**Interfaces:**
- Produces `@jarso/data/ledger`: every repository function (`fetchBalance`, `listLedgerRows`, `listMovementsSince`, `listOccurrenceAmounts`, `listClosedOccurrences` and the row types), plus:
  - `getJars(db: Client, childId: string): Promise<Jars>`
  - `getHistoryPage(db: Client, childId: string, opts: { timezone: string; now: number; before?: string }): Promise<HistoryPage>`
  - `type HistoryPage`
- The web `getHistoryPage(childId, before?)` keeps its signature. It does `assertSelfOrParentOf`, `getFamily()` for the timezone (`?? "UTC"`), and passes `now: Date.now()`. `getHistory` and `getHistorySince` stay in web unchanged.

- [ ] **Step 1:** Move the history tests and make each pass `now` explicitly. Add one case that pins the windows: a purchase 23h59m old → `canUndo: true`; 24h01m → `canUndo: false`; a fix 6d23h old → `canFix: true`.
- [ ] **Step 2:** Run `pnpm --filter @jarso/data test`. Expected: FAIL.
- [ ] **Step 3:** Move the code. `now` and `timezone` are parameters, so the shared code has no clock or session.
- [ ] **Step 4:** Run `pnpm check`, then `pnpm turbo typecheck test build`, then `pnpm test:e2e` (the e2e suite runs in PR CI per memory; run the history-touching specs locally only if the tooling allows). Expected: green.
- [ ] **Step 5:** Commit (when authorised): `refactor(data): share ledger history composition`.

### Task 4: bearer auth helper for `/api/v1`

**Files:**
- Create: `apps/web/src/features/auth/server/request-user.ts`, exported from `features/auth/server/index.ts`
- Test: `apps/web/tests/features/auth/server/request-user.test.ts`

**Interfaces:**
- Produces: `assertRequestUser(request: Request): Promise<SessionUser>`.
  - When an `Authorization: Bearer <jwt>` header is present, it verifies the token with `supabase.auth.getClaims(jwt)` on a stateless `supabase-js` client (`persistSession: false`, `autoRefreshToken: false`, publishable key from `clientEnv`).
  - Without the header, it falls back to `assertUser()`.
  - A retryable auth error → `AppError("UNAVAILABLE", "Jarso is taking a while. Please try again.")`. A bad or expired token → `AppError("UNAUTHORIZED", "You must be signed in")`.

- [ ] **Step 1:** Tests, with `getClaims` mocked:
  - valid bearer → `{ id: sub, email }`
  - an invalid bearer → UNAUTHORIZED, even when a cookie session exists
  - no header → delegates to `assertUser`
  - a header that isn't `Bearer x` → UNAUTHORIZED
  - a retryable error → UNAVAILABLE
- [ ] **Step 2:** Run `pnpm --filter @jarso/web exec vitest run tests/features/auth/server/request-user.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit (when authorised): `feat(auth): verify bearer tokens on api routes`.

### Task 5: `POST /api/v1/auth/child-sign-in`

**Files:**
- Modify: `apps/web/src/features/family/server/child-auth.ts:79-92`. Split it into `mintChildSessionTokens(childId: string): Promise<SessionTokens>` (verifyOtp on a stateless client) and the existing `mintChildSession` (cookie client; unchanged behaviour).
- Modify: `apps/web/src/features/family/server/service.ts:263-292`. Extract `verifyChildSignIn(input, ip): Promise<string /* childId */>` (limits, verify, lockout wording). `childSignIn` = verify + mint cookies. Add `childSignInForTokens(input, ip): Promise<SessionTokens>`.
- Create: `apps/web/src/app/api/v1/auth/child-sign-in/route.ts`
- Test: `apps/web/tests/app/api/v1/child-sign-in.test.ts`, plus the existing `apps/web/tests/features/family/server/*` (must stay green)

**Interfaces:**
- Produces: `type SessionTokens = { accessToken: string; refreshToken: string; expiresAt: number }`.
- Route: `POST` with body `childSignInSchema` (from `@jarso/core/auth` or family, wherever it lives) → `json(SessionTokens)`. Errors come out through `withApi`: 429 `RATE_LIMITED` with "Too many tries. Ask your parent or wait a little while.", and 401 `UNAUTHORIZED` with "Hmm, that didn't match. Check with your parent.". `getClientIp()` is used as on the web. Set `export const maxDuration = 30`.
- Password rotation stays inside `verifyChildSignIn` for now. Task 7 removes it.

- [ ] **Step 1:** Route tests, with the service mocked at the `@/features/family/server` boundary:
  - ok → 200 `{ data: { accessToken, refreshToken, expiresAt } }`
  - a bad body → 400 VALIDATION
  - invalid → 401 with the exact message
  - locked → 429 with the exact message
  - the response never contains the PIN
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the split and the route. The existing family service tests must pass unchanged, because the web cookie path behaves the same.
- [ ] **Step 4:** Run `pnpm check`. Expected: green.
- [ ] **Step 5:** Commit (when authorised): `feat(api): child pin sign-in returning session tokens`.

### Task 6: `POST /api/v1/notices/dispatch`

**Files:**
- Create: `apps/web/src/app/api/v1/notices/dispatch/route.ts`
- Test: `apps/web/tests/app/api/v1/notices-dispatch.test.ts`

**Interfaces:**
- Consumes: `assertRequestUser` (Task 4), `isPushConfigured` and `dispatchPush` (`features/notifications/server/push.ts`), and `hitRateLimit` (`features/family/server/repository.ts:162`) through a small service function `allowDispatch(userId)` in `features/notifications/server`. Key `push:dispatch:<userId>`, window `10 minutes`, max `30`.
- Route: `POST` (no body) → 202 `{ data: { queued: true } }`. Push not configured → 202 `{ data: { queued: false } }`. Over the limit → 429. The dispatch runs in `after()`, the same way `pushAfterNotices` does it. Failures are logged with `logger.error("Push dispatch failed", { code })` and never surfaced.

- [ ] **Step 1:** Tests:
  - signed out → 401
  - signed in → 202, and `dispatchPush` is scheduled once
  - the 31st call in a window → 429
  - push not configured → 202 `queued:false`, and no dispatch happens
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement it. Expected: PASS.
- [ ] **Step 4:** Commit (when authorised): `feat(api): let the app trigger push for new notices`.

### Task 7: keep phone and web signed in together

**Files:**
- Modify: `apps/web/src/features/family/server/service.ts` (drop `rotateChildPassword` from `verifyChildSignIn`; keep it in `setChildPin`), `apps/web/src/features/family/server/child-auth.ts` (doc comment), `docs/auth.md` (Children, PIN sign-in, Hosted setup), `tasks/todo.md` (tick the "Password rotation…" item)
- Create (one of): Supabase Password Verification Attempt hook configuration in `supabase/config.toml` + a hook function migration, **or** `supabase/migrations/<ts>_child_password_guard.sql`
- Test: `apps/web/tests/features/family/server/*` (rotation no longer called on sign-in, still called on reset); `supabase/tests/<name>.test.sql` pgTAP for the guard

**Interfaces:**
- Behaviour: a PIN sign-in no longer ends the child's other sessions. A password that a child session sets for itself can never be used to sign in.

- [ ] **Step 1:** Design check. Dispatch the `security-auditor` agent with the spec section "One child, two devices", `docs/auth.md:40-48` and these two options:
  - (a) A Password Verification Attempt hook that rejects `app_metadata.jarso_role = 'child'`. First check that the hosted plan offers it: ask the user to check the dashboard. Don't guess.
  - (b) A DB guard: an `AFTER UPDATE OF encrypted_password ON auth.users` trigger. When the user is a child and the change didn't come from `service_role`, it resets `encrypted_password` to a random unusable hash.

  Then use the `db-migration` skill for (b), or the hook equivalent for (a), and ask the user before any `supabase db push` (memory: cloud Supabase, ask before push).
- [ ] **Step 2:** Write the failing tests:
  - service: `childSignIn` doesn't call `rotateChildPassword`, and `setChildPin` does
  - pgTAP for (b): a child session updating its own password leaves a hash that no longer matches the password it set, while a `service_role` update still works
- [ ] **Step 3:** Implement the guard and drop the rotation from sign-in.
- [ ] **Step 4:** Run `pnpm check`, then `pnpm db:types` if the schema changed. pgTAP runs in PR CI.
- [ ] **Step 5:** Update `docs/auth.md` to say why the rotation moved and what guards the password now.
- [ ] **Step 6:** Commit (when authorised): `fix(auth): keep a child signed in on every device`.

### Task 8: brand tokens for native

**Files:**
- Create: `packages/brand/tokens.ts` (exports `palette`, `semantic: { light, dark }`, `radius`, `fontSize`, `fontFamily`), `packages/brand/tests/tokens.test.ts`, `packages/brand/vitest.config.mts`
- Modify: `packages/brand/package.json` (`"./tokens": "./tokens.ts"`, `test` script, vitest devDep)

**Interfaces:**
- Produces: `import { palette, semantic, radius, fontSize, fontFamily } from "@jarso/brand/tokens"`. Keys mirror the CSS variable names without the prefix, for example `palette.teal[600] === "#057b99"` and `semantic.light.background`.

- [ ] **Step 1:** Test: read `tokens.css` with `node:fs`, parse every `--color-*`, `--radius-*` and `--text-*` custom property and the `:root` and `.dark` semantic variables, and assert that each equals the TS value, with no extra or missing keys.
- [ ] **Step 2:** Run `pnpm --filter @jarso/brand test`. Expected: FAIL.
- [ ] **Step 3:** Write `tokens.ts` by hand from `tokens.css`.
- [ ] **Step 4:** Run it again. Expected: PASS. Then run `pnpm check`.
- [ ] **Step 5:** Commit (when authorised): `feat(brand): js tokens kept equal to tokens.css`.

### Task 9: Expo app skeleton

**Files:**
- Create: `apps/mobile/` via `pnpm create expo-app` (the latest stable SDK, TypeScript, Expo Router template), then trimmed: `app/_layout.tsx`, `src/config/env.ts`, `src/lib/{logger.ts,index.ts}`, `.env.example`, `babel.config.js`/`metro.config.js` (pnpm workspace and NativeWind), `tailwind.config.js` (theme from `@jarso/brand/tokens`), `global.css`, `jest.config.js` (`jest-expo` preset), `tests/intl.test.ts`, `tests/env.test.ts`
- Modify: root `package.json` (`"mobile": "pnpm --filter @jarso/mobile start"`), `biome.json` (include `apps/mobile/**`; ignore `.expo/`, `ios/`, `android/`), `.gitignore` (`.expo/`, `apps/mobile/ios/`, `apps/mobile/android/`, `apps/mobile/.env*` but not `!apps/mobile/.env.example`), `.github/workflows/ci.yml` (only if `turbo --affected` doesn't already pick up `lint`, `typecheck` and `test` for the new app; no `build` script in mobile), `.claude/settings.json` deny rules (add `apps/mobile/.env*`)
- Install: `nativewind`, `react-native-reusables` (follow its CLI init for Expo), `@tanstack/react-query`, `@supabase/supabase-js`, `expo-secure-store`, `expo-crypto`, `expo-haptics`, `expo-font`, `react-native-safe-area-context`, `@jarso/core`, `@jarso/data`, `@jarso/brand`, `@jarso/db`, `zod`. Dev: `jest-expo`, `@testing-library/react-native`. Check each package's current docs for its Expo SDK–compatible version (`npx expo install` where it applies).

**Interfaces:**
- Produces: `env` from `src/config/env.ts` = `{ supabaseUrl: string; supabasePublishableKey: string; apiUrl: string }`, parsed with Zod from the three `EXPO_PUBLIC_*` vars (each `process.env.EXPO_PUBLIC_X` written out literally so that Expo inlines it).
- Produces: `logger` from `src/lib` (core's logger, configured with `configureLogger`).

- [ ] **Step 1:** Tests:
  - `env.test.ts`: missing or invalid URL → throws, with the var's name in the message
  - `intl.test.ts`: compare `formatMoney` and the core date and sent-ago helpers with the expected strings from core's node tests for INR, GBP, USD and EUR and an `Asia/Kolkata` timezone (Review Focus 5)
- [ ] **Step 2:** Run `pnpm --filter @jarso/mobile test`. Expected: env passes after implementation. If intl fails, add only the missing `@formatjs/*` polyfills (imported first in `app/_layout.tsx` and in the jest setup) until it passes.
- [ ] **Step 3:** `app/_layout.tsx` renders a placeholder screen with brand fonts and the token colours. Check on a phone: run `pnpm mobile`, open the app in Expo Go, and see it load.
- [ ] **Step 4:** Run `pnpm check` and `pnpm turbo lint typecheck test build`. Expected: green, with mobile included in lint, typecheck and test.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): expo app skeleton in the workspace`.

### Task 10: session, sign-in, role gate

**Files:**
- Create:
  - `apps/mobile/src/lib/supabase/{storage.ts,client.ts}`
  - `apps/mobile/src/lib/api.ts`
  - `apps/mobile/src/lib/errors.ts`
  - `apps/mobile/src/lib/query.ts`
  - `apps/mobile/src/features/auth/{session-provider.tsx,use-session.ts,sign-in-form.tsx,index.ts}`
  - `apps/mobile/app/(auth)/{sign-in.tsx,parents.tsx}`
  - `apps/mobile/app/(child)/_layout.tsx` (a guard plus an empty tab bar: Home, History, Requests, Settings)
- Test: `apps/mobile/tests/{storage,api,errors,session}.test.ts(x)`, `apps/mobile/tests/features/auth/sign-in-form.test.tsx`

**Interfaces:**
- `secureStorage`: a `{ getItem, setItem, removeItem }` adapter over `expo-secure-store` that splits values into 1800-byte chunks under `<key>.0..n`, with a `<key>.n` count entry. Removing an item deletes every chunk.
- `supabase`: one `createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, { auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })`, plus an `AppState` listener that calls `startAutoRefresh` and `stopAutoRefresh`.
- `apiFetch<T>(path: string, init?: { method?: string; body?: unknown; auth?: boolean }): Promise<T>`. It prefixes `env.apiUrl`, adds `Authorization: Bearer <access_token>` when `auth`, unwraps `{ data }`, and throws `AppError(code, message)` from `{ error }`. A network failure throws `AppError("UNAVAILABLE", <the web's offline copy from @jarso/core/offline>)`.
- `toUserMessage(error: unknown): string`. An `AppError` gives its message. Anything else gives the generic "Something went wrong. Please try again.".
- `signInChild(input: ChildSignInInput): Promise<void>` calls `apiFetch("/api/v1/auth/child-sign-in", { method: "POST", body: input })` and then `supabase.auth.setSession`.
- `useSession(): { status: "loading" | "signed-out" | "child" ; userId?: string; signOut(): Promise<void> }`. After a session appears it reads `profiles.role` through `@jarso/data/family` `findProfileRole`. Anything other than `child` signs out and routes to `/(auth)/parents`.

- [ ] **Step 1:** Tests:
  - storage round-trips a 5 KB value and leaves no chunks after a remove
  - `apiFetch` maps `{ error: { code: "RATE_LIMITED", message } }` to an `AppError`, and a network failure to UNAVAILABLE with the offline copy
  - the sign-in form shows the 401 and 429 messages verbatim and uses `keyboardType="number-pad"` and `secureTextEntry` for the PIN
  - **`parent role signs out and shows the parents screen`**
  - **`signs out to the PIN screen when refresh fails`**: a `TOKEN_REFRESHED` failure or `SIGNED_OUT` event leads to the sign-in route, with the web's signed-out copy
- [ ] **Step 2:** Run `pnpm --filter @jarso/mobile test`. Expected: FAIL.
- [ ] **Step 3:** Implement it. Mirror the field labels and validation from web `/sign-in/child`. Add an "I'm a parent" link to `parents.tsx`, which holds the copy "Parents, use Jarso on the web for now", a link to `https://jarso.vercel.app` and, if a session exists, a sign-out button.
- [ ] **Step 4:** Run it again. Expected: PASS. Then check by hand: sign in with a hosted test child on a phone against `pnpm dev` over the LAN, and confirm that the web session for the same child stays alive (Task 7).
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): child pin sign-in and session`.

### Task 11: Home, the two jars

**Files:**
- Create: `apps/mobile/src/features/jars/{use-jars.ts,jar-card.tsx,home-screen.tsx,index.ts}`, `apps/mobile/app/(child)/index.tsx`
- Test: `apps/mobile/tests/features/jars/home-screen.test.tsx`

**Interfaces:**
- `useHome()` runs one query with the key `["home", userId]` and returns `{ jars: Jars; availability: Availability; context: FamilyContext }`. It uses `getJars`, `getAvailability` and `getFamilyContext` from `@jarso/data`.
- Query keys exported from `src/lib/query.ts`: `keys.home(userId)`, `keys.history(userId)` and `keys.requests(userId)`. Later tasks invalidate them.

- [ ] **Step 1:** Test:
  - with mocked data the screen shows both jar amounts formatted by `formatMoney`, with the same available, reserved and held lines as web `/child` (read the web component for the exact strings)
  - the buttons are "Bought something", "Put in Save", "Take out" and "Ask for extra", or whatever labels the web uses verbatim
  - pull to refresh refetches
- [ ] **Step 2:** Run the test. Expected: FAIL.
- [ ] **Step 3:** Implement it with jar art from `@jarso/brand/assets` and tokens. The buttons open the sheet routes from Tasks 12 and 13.
- [ ] **Step 4:** Run it. Expected: PASS. Then check on the phone.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): child home with both jars`.

### Task 12: log a purchase and undo it

**Files:**
- Create: `apps/mobile/src/features/diary/{purchase-sheet.tsx,category-chips.tsx,use-record-purchase.ts,use-undo.ts,index.ts}`, `apps/mobile/app/(child)/purchase.tsx` (a sheet or form-sheet route), `apps/mobile/src/lib/notices.ts`
- Test: `apps/mobile/tests/features/diary/purchase-sheet.test.tsx`

**Interfaces:**
- `useRecordPurchase()` is a mutation calling `callRecordPurchase(supabase, { childId, amountMinor, category, label, idempotencyKey })`. On success it invalidates `home` and `history`, calls `dispatchNotices()` and triggers `Haptics.notificationAsync(Success)`.
- `dispatchNotices(): void` fires `apiFetch("/api/v1/notices/dispatch", { method: "POST", auth: true })`. Errors are caught and logged with `logger.warn`, never shown.
- `useUndo()` calls `undoEntry` and invalidates the same keys.
- Validation and parsing use the web's purchase schema from `@jarso/core/diary`. Categories come from `@jarso/core/ledger` `categories`.

- [ ] **Step 1:** Tests:
  - amount entry uses the number pad, and parsing matches web (`"2.50"` → `250` minor)
  - `not_enough_spend` shows `notEnoughSpendMessage(freeMinor, currency)` verbatim and keeps the sheet open
  - **a retry after a failed request reuses the same `idempotencyKey`, and reopening the sheet makes a new one**
  - success shows the undo action, and undo calls `undoEntry` with the returned entry id
  - `dispatchNotices` is called once per success and never on failure
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement it, reading `features/diary/components/purchase-sheet.tsx` and `category-chips.tsx` first for copy and behaviour.
- [ ] **Step 4:** Run them. Expected: PASS. Then on the phone: log a purchase, see Spend drop, undo it, and see it come back. The parent's web shows the notice.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): log and undo a purchase`.

### Task 13: put in, take out, ask for extra

**Files:**
- Create: `apps/mobile/src/features/requests/{put-in-sheet.tsx,take-out-sheet.tsx,ask-extra-sheet.tsx,use-request-mutations.ts,index.ts}`, `apps/mobile/app/(child)/{put-in,take-out,ask-extra}.tsx`
- Test: `apps/mobile/tests/features/requests/sheets.test.tsx`

**Interfaces:**
- Mutations call `callCreateDeposit`, `callCreateWithdrawal` and `callCreateEmergency` (from `@jarso/data/requests`) with `childId = userId`. Each success invalidates `home`, `requests` and `history`, and calls `dispatchNotices()`.
- Result text comes from `depositMessage`, `withdrawalMessage` and `emergencyMessage` (Task 1). The rule lines and prediction come from the same core functions the web sheets use (`@jarso/core/rules`, `@jarso/core/requests`). Take-out is capped by `availability.takeOutLimitMinor`.

- [ ] **Step 1:** Tests:
  - for each sheet, each result status shows its message verbatim
  - `over_available` and over-cap keep the sheet open
  - **the same `idempotencyKey` is used on retry within one opening**
  - an emergency needs a reason, with the same validation message as web
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement them, reading the three web sheets first.
- [ ] **Step 4:** Run them. Expected: PASS. Then on the phone, try an auto-approved and a pending take-out. The parent sees the pending one on the web.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): savings requests from the phone`.

### Task 14: Requests list, History, Settings

**Files:**
- Create: `apps/mobile/src/features/requests/{request-list.tsx,use-requests.ts}`, `apps/mobile/src/features/history/{history-list.tsx,use-history.ts,index.ts}`, `apps/mobile/src/features/settings/{settings-screen.tsx,theme.ts,index.ts}`, `apps/mobile/app/(child)/{requests,history,settings}.tsx`
- Test: `apps/mobile/tests/features/{requests/request-list,history/history-list,settings/settings-screen}.test.tsx`

**Interfaces:**
- `useRequests()` calls `listRequestsFor`. Cancel calls `callCancel`, then invalidates the keys and dispatches notices.
- `useHistory()` is an infinite query over `getHistoryPage(supabase, userId, { timezone: context.timezone, now: Date.now(), before })`, where the next-page param is `olderBefore`.
- Theme: system, light or dark, stored in SecureStore under `theme` and applied through NativeWind's `colorScheme`.
- Sign out: `supabase.auth.signOut()`, and the local session is cleared even if the revoke fails, then the app routes to sign-in.

- [ ] **Step 1:** Tests:
  - request rows show the web's status labels and descriptions (from `@jarso/core/requests` `describe`), and cancel appears only where the web shows it
  - history renders every `HistoryItem.kind` with the web's labels, undone lines are marked, and it loads the next page when `olderBefore` is set and stops when it is null
  - sign-out clears the session even when `signOut` rejects
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement them, reading `request-list.tsx`, `request-actions.tsx`, the web history view and `/child/settings` first.
- [ ] **Step 4:** Run them. Expected: PASS.
- [ ] **Step 5:** Commit (when authorised): `feat(mobile): requests, history and settings tabs`.

### Task 15: docs, ADR and the wave 1 check

**Files:**
- Create: `docs/mobile.md`, `docs/adr/0016-mobile-direct-supabase.md`
- Modify: `docs/architecture.md`, `docs/api.md` (the two routes, bearer auth), `docs/auth.md` (mobile sign-in, token storage), `docs/testing.md` (jest-expo), `docs/adr/README.md`, `CLAUDE.md` (the `pnpm mobile` command, `@jarso/data` in hard rule 1/18, the mobile env rule next to rule 11), `tasks/todo.md` (wave 1 section with review)

- [ ] **Step 1:** Write the docs. ADR 0016 supersedes the twin-route part of ADR 0015.
- [ ] **Step 2:** Run the `verify` skill. Expected: everything green, reported honestly.
- [ ] **Step 3:** Walk through the spec's "Done when" list by hand on an Android phone and an iOS simulator or phone, against `pnpm dev` and the hosted project. Record each item as pass or fail in `tasks/todo.md`.
- [ ] **Step 4:** Run the `code-reviewer` and `security-auditor` agents over the branch, and fix the blocking findings.
- [ ] **Step 5:** Commit (when authorised): `docs: mobile app wave 1`.
