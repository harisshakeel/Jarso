# Mobile app (`apps/mobile`, `@jarso/mobile`)

Expo app for children. Wave 1: PIN sign-in, both jars, log a purchase and undo it, put in, take out, ask for extra, requests, history, settings. Wave 2 (parity with the web child app): goals, diary (got money, fix, versions, where it went), Learn, Jarso, News with live notices, and the offline outbox. Parents see a "use the web for now" screen. Specs: `docs/superpowers/specs/2026-11-02-mobile-app-design.md`, `2026-11-03-mobile-wave-2-design.md`. Decisions: ADR 0016, 0017 (and 0015).

## Stack

- Expo SDK 58, React 19.3 and React Native 0.88, Expo Router (file routes in `app/`, only routing and composing).
- NativeWind v4 on Tailwind 3 (v5 is still a release candidate). The theme is built from `@jarso/brand/tokens` in `tailwind.config.js`; a parity test in `packages/brand` keeps `tokens.ts` equal to `tokens.css`.
- TanStack Query for server state. Hooks live in `src/features/<name>` and call `@jarso/data` with the app's Supabase client. Mutations invalidate the affected keys (`home`, `history`, `requests`).
- Pure logic, schemas and every line of child copy come from `@jarso/core`. The app never re-words it.
- react-native-reusables primitives in `src/components/ui` (barrel).

## Rules that are easy to break

- **`react-native-css-interop` is a direct dependency, pinned to the version NativeWind pins (0.2.7).** NativeWind's Babel preset rewrites JSX to `react-native-css-interop/jsx-runtime`. With pnpm's isolated linker the app cannot resolve a dependency of a dependency, so Metro fails. Declaring it in the app fixes this without `node-linker=hoisted`. When you bump NativeWind, bump this to the same version.
- **Entry is `index.ts`, not `expo-router/entry`.** It imports `@/lib/intl` first. Hermes lacks full `Intl` (PluralRules, RelativeTimeFormat, Locale, NumberFormat), and some core modules (`allowance/describe`, `family/sent-ago`) build formatters at import time, so the polyfills must exist before any route module is evaluated.
- **Env is read only in `src/config/env.ts`.** Three public vars, Zod-checked: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`. `EXPO_PUBLIC_API_URL` must be `https:` except in dev builds (`__DEV__`), because it carries the bearer token. Anything `EXPO_PUBLIC_*` ships in the bundle, so no secret goes here. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` (not committed).
- **Data access.** Reads and writes go straight to Supabase with the child's session, so RLS applies; every mutation is an existing Postgres function that checks `auth.uid()`. `apiFetch` (`src/lib/api.ts`) is used for `/api/v1/auth/child-sign-in`, `/api/v1/notices/dispatch` and `/api/v1/guide/state`; purchases go through the outbox. The phone is not trusted: no money rule lives only in TypeScript.
- **Session** is stored in `expo-secure-store`, chunked (`src/lib/supabase/storage.ts`). See `docs/auth.md`, Mobile sign-in.
- **Money** is integer minor units. Each request create carries an `idempotencyKey` made once per sheet opening (`expo-crypto` `randomUUID`).
- **History undo uses the phone clock.** Mobile History decides `canUndo` from the phone's time (the web uses the server's). A wrong phone clock can show or hide the Undo button wrongly; the server still refuses an undo after a day.
- **Outbox.** Purchases go through core's outbox (`src/lib/outbox`): AsyncStorage, one key per user (`jarso-outbox:<userId>`), an in-process try-lock, `expo-network` for offline, `POST {EXPO_PUBLIC_API_URL}/api/v1/outbox` with the session's bearer. `<OutboxSync>` (mounted in `app/(child)/_layout.tsx`) flushes on foreground, network regain, token refresh, every 30 s and at the next backoff. Queued items are plain JSON in AsyncStorage (not encrypted, unlike the SecureStore session) and stay on the phone after sign-out, per user; Me warns first.
- **Learning.** Missions start online only through `POST /api/v1/learning/start`. Answers are graded on the phone for instant feedback (a haptic on a right answer), then every step, practice answer, check-in and finish goes through the outbox (kinds `step`, `practice`, `checkIn`, `completeMission`); the server grades again. The phone never calls a learning RPC. Reopening a mission resumes after the server's step results plus the steps still queued on the phone (`withQueuedSteps`). A topic's question saves nothing.
- **Jarso.** Shown only while `/api/v1/guide/state` says the guide is on; any guide screen opened while it is off goes to Home. Reads use `@jarso/data/guide` (own chats only, `asked_by is null`). A turn streams from `POST /api/v1/guide/turns` with `sendGuideTurn`, the global `expo/fetch` and the bearer; 52 s timeout; a resend of the same question reuses its `clientMessageId`. "Help me" / "Why?" beside a step and "Ask about this" on a topic open the `guide-sheet` form sheet with the context as a Zod-checked route param.
- **News.** The inbox reads `@jarso/data/notifications` (20 a page, `before` cursor). `<NoticeListener>` (child layout) subscribes to Realtime on the web's channel and filter (`recipient_id=eq.<uid>`), toasts a new notice, refreshes the badge and what the notice touches, closes the channel in the background and rejoins (and refetches) in the foreground.
- **UI.** Bottom tab bar (Home, Diary, Learn, Jarso, News, as the web; Jarso only when `/api/v1/guide/state` says the guide is on), Requests, Me, Goal and a diary line as pushed pages, form sheets for actions, safe areas, pull to refresh, light haptics on success, every control labelled with a role and at least 44 pt.
- `console.log` is banned here too; use `@/lib` `logger`. It never logs tokens, PINs or child ids with amounts.

## Run it

```bash
pnpm mobile                    # expo start --dev-client (apps/mobile)
pnpm --filter @jarso/mobile android
pnpm --filter @jarso/mobile test   # jest-expo
```

The web app must be reachable from the phone for sign-in and push. Run `pnpm dev` on the laptop and set `EXPO_PUBLIC_API_URL` to `http://<laptop LAN IP>:3000` (phone on the same Wi-Fi), or to a tunnel URL (`localhost` points at the phone itself). Point the Supabase vars at the hosted project; there is no local Docker stack here.

**Expo Go no longer runs the app** (wave 3 adds native modules: `expo-notifications`, and the payment sheets). Build a development build once and install the APK on the phone:

```bash
(cd apps/mobile && eas build --profile development --platform android)   # or: (cd apps/mobile && npx expo run:android), local, needs the Android SDK
pnpm mobile                                                              # then open the dev build, not Expo Go
```

Rebuild only when a native module or config plugin changes (a new `expo-*` native package, `app.json` plugins or permissions); JS changes reload over Metro as before. The `development` EAS profile is an internal-distribution APK with `expo-dev-client`. Check bundling without a device with `(cd apps/mobile && npx expo export --platform android)`, then delete `apps/mobile/dist/`. Run every `eas` and `npx expo` command from `apps/mobile`, where `eas.json` and `app.config.ts` live.

**Push credentials (FCM).** Android push goes through Firebase Cloud Messaging; neither file below is ever in the repo (see `docs/security.md`).

1. Upload the FCM v1 service-account key to EAS: `(cd apps/mobile && eas credentials)` → Android → the app → Google Service Account → FCM V1. It lives only in EAS.
2. Store `google-services.json` as an EAS file env var, once per environment: `(cd apps/mobile && eas env:create --name GOOGLE_SERVICES_JSON --type file --visibility sensitive --environment development)` (repeat for `preview` and `production`). `app.config.ts` sets `android.googleServicesFile` from it. A local `google-services.json` is git-ignored; a build without the var still works, it just gets no push token.

## Layout

```
apps/mobile/
  index.ts                 # entry: Intl polyfills, then expo-router/entry
  app/                     # (auth)/sign-in, (auth)/parents, (child)/(tabs)/{index,diary,learn,jarso,news}, pages: requests, me, goal, entry/[entryId], learn/{[missionKey],practice,check-in,week,week-question,topics/[topicKey]}, jarso/[conversationId]; sheets: purchase, put-in, take-out, ask-extra, received, goal-sheet, guide-sheet
  src/features/<name>/     # auth, jars, diary, goals, learning, guide, news, requests, history, settings; home and learn (composites)
  src/components/          # ui (primitives), sheet (shared sheet parts), screen
  src/lib/                 # supabase client + storage, api, outbox, query keys, errors, notices, logger, intl
  src/config/{env,site}.ts
  tests/                   # jest-expo
```

## Device e2e (Maestro)

Flows in `apps/mobile/e2e/`: `sign-in`, `money-loop` (purchase and undo, put in, take out, ask extra, cancel, got money), `diary` (fix, earlier versions), `goal`, `learn`, `news`, `guide`, `offline` (a purchase queued in airplane mode replays). Install the development build (`(cd apps/mobile && eas build --profile development --platform android)`, or `(cd apps/mobile && npx expo run:android)`; see Run it), start `pnpm mobile`, then `maestro test -e CHILD_FAMILY_CODE=… -e CHILD_NICKNAME=… -e CHILD_PIN=… e2e` from `apps/mobile` (or `pnpm --filter @jarso/mobile e2e` with the same `-e` flags). The seeded child's first diary row must be fixable (a purchase or got-money line) and put-in and take-out must be allowed by the family's rules. Credentials are the hosted test family's, passed from the shell and never committed. Not run in CI.

Unverified until run on a device: `expo/fetch` NDJSON streaming and abort on Android, Realtime `setAuth` with the SecureStore session, the outbox draining on reconnect, and Hermes `Intl` parity for `familyToday`. The checklist is in `tasks/todo.md`.

Cross-module imports go through each module's `index.ts`, as on the web.
