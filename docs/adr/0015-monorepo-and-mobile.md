# 0015. Monorepo and a shared core for the mobile app

- Status: Accepted
- Date: 2026-11-02

## Context

Most kids and parents use Jarso on their phones. A native app becomes the main surface, and the web app stays live next to it. Parents and kids both use mobile from day one, so shared code must cover the parent flows (allowance, requests, rules, payments, family) as well as the child flows.

Both apps must run the same money rules, schemas, copy and learning content. Today all of that lives in one Next.js app. Every feature barrel mixes pure code, React components and server code, so nothing can be imported without pulling in Next. Design: `docs/superpowers/specs/2026-11-02-monorepo-shared-core-design.md`.

## Decision

- **A pnpm + Turborepo workspace.** `apps/web` (package `@jarso/web`, today's app), later `apps/mobile`, and `packages/{core,content,db,brand,tsconfig}`. `supabase/`, `docs/`, `scripts/` and `.claude/` stay at the root.
- **Packages ship TypeScript source.** No build step. `exports` point at `src/*.ts`, web lists them in `transpilePackages`, and Metro reads TS natively.
- **`packages/core` holds all pure code.** Money, dates, errors, Zod schemas, types, describe/predict/grade logic and copy. One `exports` subpath per module (`@jarso/core/goals`). It depends only on `zod`, `@jarso/content` and `@jarso/db`. Biome blocks React, Next, server code and `@/*` inside it.
- **pnpm's isolated linker, React per app.** No `node-linker=hoisted`. `react` is declared only in apps, never at the root or in a package.
- **Web barrels re-export core.** `@/lib` and each `features/<x>/index.ts` re-export `@jarso/core/...`, so web import sites stay as they are.
- **Vercel Root Directory is `apps/web`.** `vercel.json` moves with the app.
- **Web-only UI stays web-only.** `@base-ui/react` and shadcn stay in web. Mobile will use `react-native-reusables`.
- **Offline outbox goes behind ports.** Core defines a store interface and a platform port. Web supplies the `idb` store and `navigator`.

## Consequences

- Web behaviour does not change. Each step lands green on its own: move web, extract the small packages, then extract core feature by feature.
- Core is the base for the mobile API (step 4). About 50 mutations exist only as Server Actions (roughly 35 parent, 15 child), and every read is called from server-rendered pages with no route. Step 4 is sized at about 50 actions plus the reads. Whether mobile reads use `/api/v1` or Supabase with RLS is open and decides most of that size.
- Hermes caveats for step 5. `family/codes` and `offline/outbox/uuid` use Web Crypto. Money, dates, describe, sent-ago and currency need full `Intl` (PluralRules, RelativeTimeFormat, Locale, timeZone). Both need polyfills checked on device.
- Local setup changes: `.env.local` lives in `apps/web/`, and app-only scripts run as `pnpm --filter @jarso/web <script>`.
- Core modules form layers (`lib` and `config` at the bottom, leaf features, then composites). More packages can be split out later when a module needs its own dependency or build.
