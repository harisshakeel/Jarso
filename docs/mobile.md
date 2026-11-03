# Mobile app (`apps/mobile`, `@jarso/mobile`)

Expo app for children, wave 1: PIN sign-in, both jars, log a purchase and undo it, put in, take out, ask for extra, requests, history, settings. Parents see a "use the web for now" screen. Spec: `docs/superpowers/specs/2026-11-02-mobile-app-design.md`. Decision: ADR 0016 (and 0015).

## Stack

- Expo SDK 58, React 19.3 and React Native 0.88, Expo Router (file routes in `app/`, only routing and composing).
- NativeWind v4 on Tailwind 3 (v5 is still a release candidate). The theme is built from `@jarso/brand/tokens` in `tailwind.config.js`; a parity test in `packages/brand` keeps `tokens.ts` equal to `tokens.css`.
- TanStack Query for server state. Hooks live in `src/features/<name>` and call `@jarso/data` with the app's Supabase client. Mutations invalidate the affected keys (`home`, `history`, `requests`).
- Pure logic, schemas and every line of child copy come from `@jarso/core`. The app never re-words it.
- react-native-reusables primitives in `src/components/ui` (barrel).

## Rules that are easy to break

- **`react-native-css-interop` is a direct dependency, pinned to the version NativeWind pins (0.2.7).** NativeWind's Babel preset rewrites JSX to `react-native-css-interop/jsx-runtime`. With pnpm's isolated linker the app cannot resolve a dependency of a dependency, so Metro fails. Declaring it in the app fixes this without `node-linker=hoisted`. When you bump NativeWind, bump this to the same version.
- **Entry is `index.ts`, not `expo-router/entry`.** It imports `@/lib/intl` first. Hermes lacks full `Intl` (PluralRules, RelativeTimeFormat, Locale, NumberFormat), and some core modules (`allowance/describe`, `family/sent-ago`) build formatters at import time, so the polyfills must exist before any route module is evaluated.
- **Env is read only in `src/config/env.ts`.** Three public vars, Zod-checked: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`. Anything `EXPO_PUBLIC_*` ships in the bundle, so no secret goes here. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` (not committed).
- **Data access.** Reads and writes go straight to Supabase with the child's session, so RLS applies; every mutation is an existing Postgres function that checks `auth.uid()`. `apiFetch` (`src/lib/api.ts`) is used only for `/api/v1/auth/child-sign-in` and `/api/v1/notices/dispatch`. The phone is not trusted: no money rule lives only in TypeScript.
- **Session** is stored in `expo-secure-store`, chunked (`src/lib/supabase/storage.ts`). See `docs/auth.md`, Mobile sign-in.
- **Money** is integer minor units. Each request create carries an `idempotencyKey` made once per sheet opening (`expo-crypto` `randomUUID`).
- **History undo uses the phone clock.** Mobile History decides `canUndo` from the phone's time (the web uses the server's). A wrong phone clock can show or hide the Undo button wrongly; the server still refuses an undo after a day.
- **UI.** Bottom tab bar (Home, History, Requests, Settings), form sheets for actions, safe areas, pull to refresh, light haptics on success, every control labelled with a role and at least 44 pt.
- `console.log` is banned here too; use `@/lib` `logger`. It never logs tokens, PINs or child ids with amounts.

## Run it

```bash
pnpm mobile                    # expo start (apps/mobile)
pnpm --filter @jarso/mobile android | ios
pnpm --filter @jarso/mobile test   # jest-expo
```

The web app must be reachable from the phone for sign-in and push. Run `pnpm dev` on the laptop and set `EXPO_PUBLIC_API_URL` to `http://<laptop LAN IP>:3000` (phone on the same Wi-Fi), or to a tunnel URL (`localhost` points at the phone itself). Point the Supabase vars at the hosted project; there is no local Docker stack here.

Wave 1 should run in Expo Go because every native module in use ships in it; confirm on a device (SDK 58, the React Compiler and Reanimated are unverified there). If one is ever added that Expo Go lacks, switch to a dev build (`npx expo run:android` or `run:ios`, or EAS). Check bundling without a device with `npx expo export --platform android`, then delete `dist/`.

## Layout

```
apps/mobile/
  index.ts                 # entry: Intl polyfills, then expo-router/entry
  app/                     # (auth)/sign-in, (auth)/parents, (child)/(tabs)/{index,history,requests,settings}, sheets: purchase, put-in, take-out, ask-extra
  src/features/<name>/     # auth, jars, diary, requests, history, settings: components, hooks, index.ts
  src/lib/                 # supabase client + storage, api, query keys, errors, notices, haptics, logger, intl
  src/config/{env,site}.ts
  tests/                   # jest-expo
```

Cross-module imports go through each module's `index.ts`, as on the web.
