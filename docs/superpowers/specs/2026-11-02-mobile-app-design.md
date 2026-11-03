# Mobile app (Expo), wave 1: the child's money loop

Date: 2026-11-02. Owner: Pratyush. This spec replaces steps 4 and 5 of the mobile migration in `2026-11-02-monorepo-shared-core-design.md`. The decision that changes them is "the phone talks to Supabase directly" (below). It covers wave 1 in full and sizes waves 2 and 3, which each get their own spec.

## Why

Most kids and parents use Jarso on their phones. A native app becomes the main surface, and the web app stays live next to it. The end goal is **parity: everything the web app does, the mobile app does**, for both children and parents.

The first build has to prove one thing on a real phone: **a child signs in, sees their Spend and Save jars, logs a purchase, and asks to move money into or out of Save.** If that works and feels like a phone app, the rest is more screens on the same foundation.

## Waves

| Wave | Who | Scope |
|---|---|---|
| **1 (this spec)** | Child | PIN sign-in, Home with both jars, log a purchase (and undo it), put money into Save, take money out of Save, ask for extra money, see and cancel open requests, money history, sign out, light/dark theme |
| 2 | Child | Goals, the rest of the diary (money received, fix an entry, entry versions), missions and practice, notices/inbox, Jarso guide, offline outbox |
| 3 | Parent | Email sign-in, Home (family's week), deciding requests, allowance, money rules, children and PINs, payments, Jarso for parents, native push |

Order is fixed (my call): wave 1 proves the stack on the smallest loop, wave 2 finishes the child (the person the first build is for), wave 3 does parents, who still have the full web app meanwhile.

## Goals (wave 1)

1. `apps/mobile` exists in the workspace: an Expo app that runs on Android and iOS through Expo Go or a development build.
2. A child signs in with family code, nickname and PIN. The rate limits, lockout, password rotation and wording are the same as on the web.
3. The child can do every wave 1 action in the table above, with the same rules, results and child-facing copy as the web app.
4. Money rules are enforced in one place only: the existing Postgres functions and RLS. The app adds no new rule.
5. Domain code is shared, not copied: schemas, types, money formatting, copy and request/diary result handling come from `@jarso/core`. Supabase queries come from a new shared `@jarso/data` package that web also uses.
6. Web behaves and deploys exactly as before. `pnpm check` and `turbo lint typecheck test build` stay green at every commit.

## Non-goals (wave 1)

- Anything listed under waves 2 and 3.
- App store or Play Store release, EAS Submit, store listings, OTA update channels.
- Native push notifications (wave 3). Offline use (wave 2; wave 1 says clearly when the phone is offline and doesn't queue).
- Parents on mobile. A parent who opens the app sees a short screen that sends them to the web for now.
- Any database migration, schema change or new money rule. The one exception is the child-password guard under "One child, two devices", if the auth hook isn't available. Any other need for a migration: stop and raise it.
- On-device end-to-end tests (Maestro/Detox). Planned with wave 2.

## Anti-goals (a failure even if it works)

- A money rule written in TypeScript in the app that the database doesn't also enforce. The phone is not trusted.
- The web app squeezed into a phone. Wave 1 uses a tab bar, bottom sheets, native inputs (number pad for money and PIN) and haptics on success.
- Any secret in the app bundle. The app holds only the Supabase URL, the publishable key and the web origin.
- A child session that is easier to keep or abuse on a phone than on the web (for example, a refresh token readable by other apps).
- A web regression on the way.

## Decided

From the user:

- Parity with the web app is the end goal, released in waves. The first build is the child loop above.
- Android and iOS both, through Expo.
- Wave 1 runs against local `pnpm dev` (reached from the phone over the LAN or a tunnel) talking to the hosted Supabase project. Test children are created there. The web routes reach production later, before any real child uses the app.
- Fix the cross-device sign-out in wave 1, so the phone and the web stay signed in together (see "One child, two devices").

Earlier specs (2026-11-02 monorepo spec, ADR 0015):

- Expo, in `apps/mobile`, package `@jarso/mobile`.
- `react-native-reusables` for components (shadcn's React Native counterpart), with NativeWind for styling.
- Brand tokens are shared through `packages/brand`.
- Internal packages ship TypeScript source. Metro reads it directly.
- Biome, not ESLint. pnpm isolated linker, no hoisting. `react` is declared only inside apps.

## Design

### How the app reaches data

```
apps/mobile ──supabase-js (user session, RLS)──> Postgres functions + tables
     │
     └──fetch + Bearer token──> apps/web /api/v1 (only where a server secret is needed)
```

**Direct to Supabase (my call, discussed with the user).** Nearly every money change is already a Postgres function guarded by RLS and `auth.uid()`: `record_purchase`, `undo_diary_entry`, `create_withdrawal`, `create_deposit`, `create_emergency`, `cancel_request`, `balance`, `available_spend`, `available_save`, `reserved_save`, `held_spend`, `withdrawal_cap_remaining`, `list_ledger_history`. The spec review checked every one of them. Each compares the caller with the child through `is_self` (`p_child_id = auth.uid()`, `20261028181734_family_core.sql:172`) or `is_parent_of`, so none trusts its `p_child_id` argument. The web services' `assertRole("child")` is a convenience, not the guard. Any function added later must be checked the same way before the phone calls it directly.

**Web service logic that is more than a role check moves to shared code (my call).** Some web services do real work on top of the repositories:

- `ledger/server/service.ts` `getHistoryPage` (about 200 lines) groups rows by source and builds diary items with `canUndo`/`canFix` windows. It also collapses request pairs, adds skipped allowances, and handles the paging cutoff. It reads `allowance_occurrences` through `listOccurrenceAmounts` and `listClosedOccurrences`.
- `requests/server/service.ts` `getAvailability` works out `takeOutLimitMinor`.
- Result mapping turns `too_late` and `not_enough_spend` into the child's messages.
- The put-in and take-out result copy lives in the web sheet components.

All of it moves out of web. Pure composition and copy go to `@jarso/core` (functions that take rows, plus "now" as an argument). The query orchestration that needs a client goes to `@jarso/data` as service-level functions (`getHistoryPage(client, childId, …)`). The web services then become thin wrappers: they check the role, create the client, and call the shared function. Their existing tests must stay green with no behaviour change. The mobile app never re-implements any of this logic.

**Through `/api/v1`** only for what needs a server secret or a server-side effect:

| Route | Why it can't be direct |
|---|---|
| `POST /api/v1/auth/child-sign-in` | Uses the admin client (`verify_child_pin`, password rotation, minting the session) and IP rate limits |
| `POST /api/v1/notices/dispatch` | Sends web push to the parent for notices the child's action just created (`dispatchPush` is a global admin-client sweep that needs the VAPID keys) |

That replaces the "about 50 `/api/v1` twins" step 4 was going to build. Waves 2 and 3 add routes only for the guide, payments, invites, outbox and native push.

### Shared data package: `packages/data` (`@jarso/data`)

The web's repositories already take a `SupabaseClient<Database>` argument and import nothing from Next apart from `server-only` and `@/lib` (`AppError`, `toAppError`, which now live in `@jarso/core/lib`). They move, one function at a time as mobile needs them, into `packages/data/src/<module>/repository.ts`, exported by subpath (`@jarso/data/requests`).

- Wave 1 moves the functions behind the wave 1 actions:
  - balances and availability (requests, ledger), and `withdrawal_cap_remaining`
  - `record_purchase` and `undo_diary_entry`
  - the three request-create calls, `cancel_request` and the open-requests list
  - `list_ledger_history`, and `listOccurrenceAmounts` and `listClosedOccurrences` for History
  - the family context read (currency, timezone) that the child's Home needs
- Each web `features/<x>/server/repository.ts` keeps its file and its `import "server-only"`, and re-exports the moved functions, so no web call site changes.
- `@jarso/data` depends on `@jarso/core`, `@jarso/db` and `@supabase/supabase-js` (types plus the client type). It has the same purity rules as core (no React, Next, `server-only`, `@supabase/ssr`, platform globals), enforced by the same Biome override. "Only repositories touch table and column names" still holds: `@jarso/data` is the repository layer, shared.
- Tests move with the functions they cover, into `packages/data/tests/`, and run in node against a fake client, as the web repository tests do today.

### Auth on the phone

**Child sign-in.** `POST /api/v1/auth/child-sign-in` with `{ familyCode, nickname, pin }`, parsed with the existing `childSignInSchema`.

- It runs the same `childSignIn` steps as the web: the rate limits keyed on the IP hash, `verify_child_pin`, the lockout handling and wording, and `rotateChildPassword`. *(Outcome 2026-11-03: rotation was removed; see "One child, two devices".)*
- The last step differs. Instead of `verifyOtp` on the cookie client, it calls `verifyOtp` on a stateless `supabase-js` client (no cookie storage, `persistSession: false`) and returns `{ accessToken, refreshToken, expiresAt }`.
- The service is split so the web and the API share every step except where the session lands (`mintChildSession` → `mintChildSessionTokens` returning tokens, and the web path sets them as cookies). The error mapping is the same, and the route responds through `withApi`.
- The phone calls `supabase.auth.setSession(tokens)`. After that, supabase-js refreshes the session itself.

**Session storage.** Use `expo-secure-store` (Keychain / Keystore) through a storage adapter given to `createClient({ auth: { storage } })`. Sessions can exceed SecureStore's ~2 KB value limit, so the adapter either chunks the value or encrypts it into AsyncStorage with a key held in SecureStore. The builder picks one and tests it with a real session (my call: chunking, as the fewer moving parts). Use `autoRefreshToken: true`, stop/start refresh on `AppState` changes (Supabase's documented React Native pattern), and `detectSessionInUrl: false`.

**Bearer auth on `/api/v1`.** Add `getRequestUser(request)` / `assertRequestUser(request)` to `features/auth/server`:

- With an `Authorization: Bearer <jwt>` header, verify the token with `getClaims(token)` and build a per-request `supabase-js` client that sends that token, so RLS applies as that user.
- Without the header, fall back to today's cookie path.
- Wave 1 needs only the verified user id. `notices/dispatch` checks the bearer, rate-limits, and runs the admin sweep. So wave 1 builds `assertRequestUser`, and the per-request bearer client waits for wave 2, when the outbox and guide routes need it.
- `withApi`'s same-origin check stays. React Native sends no `Origin`, and a bearer request carries no cookies, so it passes and is not CSRF-exposed.

**Roles.** Wave 1 has no parent sign-in on the phone (my call). The sign-in screen is the child's PIN form, plus an "I'm a parent" link to a screen that sends parents to the web. After sign-in the app reads `profiles.role` through RLS. If the session is not `child`, it signs out and shows that same screen, so it can never reach the child tabs.

**One child, two devices (decided by the user: fix in wave 1).** Today every PIN sign-in rotates the child's password, and GoTrue then ends the child's other sessions. So the phone and the web would keep signing each other out. The fix already listed in `tasks/todo.md` is to rotate only on PIN reset (and in `setChildPin`), not on every sign-in.

That rotation also closes a gap, though. A child session could set its own password with `updateUser({ password })` and later sign in without the PIN or its lockout (`docs/auth.md`, Children). "Secure password change" doesn't stop a fresh session from doing that. So wave 1 has to close the gap another way before it drops the rotation:

- **First choice:** if the hosted plan allows it, a Password Verification Attempt auth hook that rejects password sign-in for `jarso_role = child`.
- **Otherwise:** a database-side guard that stops a child-set password from working, for example a trigger on `auth.users` that resets or flags `encrypted_password` changes not made by `service_role`, checked at sign-in. This is a migration, so it is an exception to the "no migration" non-goal, made deliberately.

The builder runs the `security-auditor` agent on the chosen design before building it and updates `docs/auth.md`. Done when: signing in on the phone leaves the web session alive, and the reverse, and a child-set password still can't be used to sign in.

> **Outcome (2026-11-03).** The database-guard option (b), refined, was chosen: the `on_auth_child_password_changed` trigger scrambles every child password hash. Rotation was removed entirely, on PIN sign-in, in `setChildPin` and on PIN reset (sessions are still revoked on reset), so `rotateChildPassword` no longer exists. See `docs/auth.md`.

**Sign-out.** `supabase.auth.signOut()`, then clear the stored session even if the revoke call fails (same rule as the web).

### Push after a child's action

The web calls `pushAfterNotices()` after record-purchase and request actions, so the parent's web push goes out at once. Mobile calls `POST /api/v1/notices/dispatch` (bearer, fire-and-forget, failures logged and ignored) after each mutation that can create a notice: purchase, undo, the three request creates, cancel. The route runs `dispatchPush` exactly as `pushAfterNotices` does, and only for a signed-in user. It is rate-limited per user (my call: 30 per 10 minutes through `hit_rate_limit`), because it does work for every pending notice. If a dispatch is missed, the existing daily `/api/cron/push` sweep still delivers it.

### App structure

```
apps/mobile/
  app/                       # Expo Router (file-based routes only, like apps/web/src/app)
    _layout.tsx              # providers: theme, session, query client, fonts
    (auth)/sign-in.tsx
    (auth)/parents.tsx       # "use the web for now"
    (child)/_layout.tsx      # tab bar: Home, History, Requests, Settings
    (child)/index.tsx        # Home: two jars
    (child)/history.tsx
    (child)/requests.tsx
    (child)/settings.tsx
    (child)/purchase.tsx     # presented as a bottom sheet / modal route
    (child)/put-in.tsx       # sheet
    (child)/take-out.tsx     # sheet
    (child)/ask-extra.tsx    # sheet
  src/
    features/<name>/         # components/, hooks (queries & mutations), index.ts barrel
    components/ui/           # react-native-reusables primitives + index.ts
    lib/                     # supabase client, api fetch, query client, logger, haptics
    config/env.ts            # Zod-validated EXPO_PUBLIC_* vars
```

- The same rules as the web, adapted. Routes only compose. Feature code sits in `src/features/<name>` behind an `index.ts` barrel. Cross-module imports go through barrels. Pure logic comes from `@jarso/core`, queries from `@jarso/data`.
- **Server state uses TanStack Query** (my call). Each feature exposes hooks (`useJars`, `useRecordPurchase`, …) that call `@jarso/data` with the app's client. A mutation invalidates the queries it affects (jars, history, requests), the way web actions revalidate paths. There is no global store.
- **Idempotency.** Request creates take an `idempotencyKey`, as on the web. Mobile makes one per sheet opening with `expo-crypto`'s `randomUUID`, so a double tap or a retry after a timeout cannot create two requests.
- **Errors.** `AppError` from core. User-facing text is the same safe message the web shows. The app's logger wraps core's `logger` and never logs tokens, PINs or amounts tied to a child id.
- **Env** (`config/env.ts`, Zod, read once): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`. Committed as `apps/mobile/.env.example` with placeholders. `process.env.EXPO_PUBLIC_*` is read only in this file, which becomes the mobile counterpart of rule 11.

### Look and feel

- Tokens are shared. `packages/brand` gains `tokens.ts`, the same palettes, type scale, radii and semantic light/dark colours as `tokens.css`, exported for NativeWind's theme. A test in `packages/brand` asserts that the two stay equal: it parses the CSS custom properties and compares them with the TS values. *(my call: hand-authored TS plus a parity test, rather than a CSS→TS generator, fewer moving parts)*
- Fonts and logos come from `packages/brand/assets` and the fonts `docs/design.md` names, loaded with `expo-font`.
- Coaches, jar art and copy are the same as on the web, where a wave 1 screen shows them. Child copy comes from core and is never rewritten in the app.
- Phone patterns: a bottom tab bar, actions as bottom sheets (`@gorhom/bottom-sheet` or Expo Router's form-sheet presentation, the builder's pick), number pad for money and PIN, pull to refresh on Home, History and Requests, light haptics on a successful purchase or request, and safe-area handling throughout.
- Accessibility: every control has a label and a role, and touch targets are at least 44 pt. Text scales with the system font size up to the point where layouts would break, which the builder checks on the smallest supported phone.

### Wave 1 screens and the web screens they copy

| Mobile | Web source of truth |
|---|---|
| Sign in | `/sign-in/child` |
| Home: Spend and Save jars, available amounts, reserved/held notes, buttons for the actions | `/child` Home (jar part only; goal, missions and coach cards are wave 2) |
| Purchase sheet: amount, what-for chips, note, "not enough in Spend" result, undo afterwards | `features/diary/components/purchase-sheet.tsx`, `category-chips.tsx`, undo flow |
| Put in Save / Take out of Save / Ask for extra | `features/requests/components/{put-in,take-out,ask-extra}-sheet.tsx` |
| Requests list with cancel | `/child/requests`, `request-list.tsx`, `request-actions.tsx` |
| History | the child's ledger history view |
| Settings: theme, sign out | `/child/settings` |

The builder reads each web component before building its mobile twin. Behaviour, results, validation messages and copy must match. Layout should be phone-native, not a copy of the web layout.

### Runtime caveats (from the monorepo spec)

- **Intl.** Core's money, dates, describe and sent-ago need `Intl.NumberFormat` with currency, `PluralRules`, `RelativeTimeFormat` and time zones. Check Hermes support for each on the Expo SDK in use. Add `@formatjs` polyfills only for what's missing, and add a test that formats a sample amount and date in each supported currency.
- **Web Crypto.** Wave 1 needs only `randomUUID` (`expo-crypto`). `family/codes` isn't used by the child in wave 1.

### Tooling and CI

- `apps/mobile` has `lint` (Biome), `typecheck` and `test` scripts, so turbo picks it up. It has no `build` in CI for wave 1 (no EAS). It is added to CI's lint, typecheck and test job.
- Unit and component tests use `jest-expo` with React Native Testing Library (Expo's supported runner, my call; Vitest can't run React Native components well). Logic that could be pure belongs in core or data and is tested there with Vitest.
- New `/api/v1` routes and the bearer helper get Vitest tests in `apps/web/tests`, alongside the existing route tests. The split `childSignIn` service keeps its existing tests green.
- Root scripts: `pnpm mobile` → `pnpm --filter @jarso/mobile start`.
- `scripts/check-secrets.sh`, gitleaks and commitlint cover the new folders unchanged. Check that `.gitignore` covers `.expo/`, `ios/`, `android/` (prebuild output) and `apps/mobile/.env*` except `.env.example`.

### Docs

- `docs/mobile.md`: running it locally (Expo Go or a dev build, `EXPO_PUBLIC_API_URL` set to the laptop's LAN address or a tunnel URL, the hosted Supabase), env, structure, and the data-access rule (direct with RLS, `/api/v1` only for secrets).
- `docs/architecture.md`, `docs/api.md` (new routes, bearer auth), `docs/auth.md` (mobile child sign-in, token storage), `docs/testing.md` (jest-expo).
- ADR 0016: "Mobile reads and writes through Supabase directly; `/api/v1` only for server secrets", superseding the twin-route plan in ADR 0015.
- `CLAUDE.md`: commands and the mobile rules.

## Left to the builder

- Exact Expo SDK, Expo Router, NativeWind and react-native-reusables versions: the latest stable set that works together on the day. Check their docs, not memory.
- Bottom-sheet library, the SecureStore adapter approach, and query keys.
- How each moved repository function is grouped into files inside `@jarso/data`.
- Visual detail inside the brand tokens and `docs/design.md`.

## Done when (wave 1)

- On a real Android phone and an iOS simulator or phone, against local `pnpm dev` and the hosted project, a test child can:
  - sign in with the PIN
  - see both jars with the right amounts
  - log a purchase, see Spend drop, and undo it
  - put money into Save, take money out (auto-approved and pending cases), and ask for extra
  - see the open requests and cancel one
  - see each of these in History
  - sign out

  The parent sees the resulting requests and notices on the web, and gets the web push.
- Signing in on the phone keeps the child's web session alive, and the reverse. A child-set password can't be used to sign in.
- A wrong PIN shows the web's wording. Five wrong PINs lock that source with the web's wording.
- "I'm a parent" leads to the "use the web" screen. A non-child session can never reach the child tabs.
- `pnpm check` is green, and the turbo pipeline is green in CI, including `apps/mobile` lint, typecheck and test.
- Web is unchanged for users. Its existing unit and e2e tests pass.
