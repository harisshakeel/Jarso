# Monorepo and shared core for the mobile app

Date: 2026-11-02. Owner: Pratyush. Covers steps 1–3 of the mobile migration (monorepo, shared packages, `packages/core`). Steps 4–5 (mobile API and the Expo app) are scoped here so the sizes are known. Each gets its own spec later.

## Why

Most kids and parents use Jarso on their phones. A native app becomes the main surface, and the web app stays live next to it. Both apps must run the same money rules, schemas, copy and learning content. Today all of that lives inside a single Next.js app. Pure logic, React components and server code share one barrel per feature, so nothing can be imported without also pulling in Next.

Parents and kids both use mobile from day one. Core therefore has to cover the parent flows (allowance, requests, rules, payments, family), not only the child flows.

## Goals

1. The repo becomes a pnpm + Turborepo workspace: `apps/web` (today's app, unchanged behaviour), `packages/{core,content,db,brand,tsconfig}`, with `supabase/` at the root.
2. `packages/core` holds every pure module: money, dates, errors, Zod schemas, types, describe/predict/grade logic, copy. Each module is importable by subpath (`@jarso/core/goals`), and none of it depends on React, Next or a server.
3. The pure tests move with their modules and run in a node environment. Everything else stays in `apps/web/tests`.
4. The offline outbox logic (`state`, `flush`, `submit`, `send`) moves to core behind an injected store and platform port. Web keeps its `idb` store.
5. `pnpm turbo lint typecheck test build` is green at the end of every step. Web deploys and behaves exactly as before.

## Non-goals (this spec)

- Bearer auth, `/api/v1` twins, `packages/api-client` (step 4, own spec).
- `apps/mobile` (step 5, own spec).
- JS/NativeWind tokens in `packages/brand`. They arrive with mobile.
- A Supabase client factory in `packages/db`. Web keeps `@supabase/ssr`; mobile builds its own `supabase-js` client in step 5.
- Rewriting the historical `docs/superpowers/{specs,plans}` paths.
- Any behaviour, schema, migration or copy change.

## Anti-goals (a failure even if it works)

- A web regression or a broken deploy on the way. Each step lands green and on its own.
- A big-bang rewrite of import sites. The ~170 `@/lib` and ~180 `@/features/<x>` barrel imports in web stay as they are (see "Import strategy").
- `react` declared at the root or in any package. Each app owns its React copy.
- Weakening the server/client barrel rule or the `server-only` guarantees web has today.

## Decided (from the user and the feedback they shared)

- Layout: `apps/web`, `apps/mobile` (later), `packages/{core,content,db,api-client (later),brand,tsconfig}`, `supabase/` and `docs/` at root.
- Biome, not ESLint. Core's purity is enforced by a Biome `overrides` entry on `packages/core/**` with `noRestrictedImports` for `react`, `react-dom`, `next`, `next/*`, `server-only`, `@supabase/ssr`, `idb`.
- pnpm's default isolated linker. No `node-linker=hoisted`. `react` only inside apps.
- `@base-ui/react` and shadcn stay web-only. Mobile will use `react-native-reusables`.
- `supabase/` stays at root. `db:types` writes to `packages/db/src/database.types.ts`.
- `scripts/check-secrets.sh`, `db-revert.sh`, husky and commitlint stay at root as root tasks.
- `vercel.json` moves into `apps/web`. Vercel Root Directory becomes `apps/web`. **The user flips it in the dashboard at the moment step 1 merges.** The step 1 PR's preview deploy is expected to fail. Step 1 is verified by CI plus a local `pnpm --filter @jarso/web build && start`, and after the flip, by the first production deploy of `main` (load, sign in, child PIN sign-in).
- Order: (1) move web into `apps/web`, (2) extract `brand`, `content`, `db`, `tsconfig`, (3) extract `core` feature by feature with its tests.
- Add ADR 0015 for the monorepo and mobile decision.

## Findings that change the feedback

Two audits of the repo (2026-11-02) turned up these:

1. **Feature barrels are all mixed.** Every `features/<x>/index.ts` exports components and server actions alongside pure code. Core needs its own per-feature entry points, so it uses package.json `exports` subpaths (`@jarso/core/goals`) rather than one barrel.
2. **`@/lib` pulls in Next.** It re-exports `action.ts` and `fallback.ts` (`next/navigation`) and `utils.ts` (`cn`). The pure parts (`money`, `dates`, `errors`, the `ActionResult`/`ActionState`/`idle` types, `PAYMENT_PROVIDER_IDS`) move to `@jarso/core/lib`.
3. **About 30 "nearly pure" files** have a single blocker. The blockers are:
   - a value import from `@/lib` or `@/config`
   - an import of another feature's mixed barrel
   - `import type { Route } from "next"` (`auth/schemas`, `notifications/links`, `config/site`)
   - `import type` from `@/lib/payments`, which is `server-only` (`allowance/types`, `payments/types`, `payments/status`). They only need `lib/payments/types.ts`, which is pure.
   - a type defined in a `.tsx` file: `requests/settle` takes `ParentRequestItem` from a component, and `learning/coaches` takes `coachIds` from `components/brand/jar-coach.tsx`
   - `import "server-only"` in `learning/content.ts`

   Each needs a small fix before it moves.
4. **The offline outbox is more coupled than "move 5 files".**
   - `send.ts` imports network reporting from the React hook `use-online.ts`.
   - `flush.ts` and `submit.ts` call `open()` from the idb store directly and read `navigator.locks` and `navigator.onLine`.
   - Both `send.ts` and `guide/send-turn.ts` fetch relative URLs.

   Core needs a store interface, a platform port and an injected base URL.
5. **The mobile API is much bigger than "twins".** About 50 mutations exist only as Server Actions: roughly 35 parent and 15 child. Every read (jars, history, due, notices…) is called from RSC pages and has no route at all. This is step 4's sizing problem. It doesn't change steps 1–3, but core is exactly what step 4 reuses.
6. **Runtime caveats for React Native**, recorded for step 5:
   - `family/codes` and `offline/outbox/uuid` use Web Crypto.
   - money, dates, describe, sent-ago and currency need full `Intl` (PluralRules, RelativeTimeFormat, Locale, timeZone).
7. **Infra details:**
   - The root `.gitignore` anchors `/.next/`, `/test-results/`, `/playwright-report/`, `/coverage` and `/evals/guide/results/` to the root.
   - The `.claude/settings.json` deny rules cover `./.env*` only.
   - `next.config.ts` has a raw `.md` loader for `guide/server/instructions.md`.
8. **Unrelated bug spotted:** `tests/e2e/diary.spec.ts` has no Playwright project, so it never runs. It is left out of this work and flagged separately.

## Design

### Workspace

- `pnpm-workspace.yaml` gains `packages: ["apps/*", "packages/*"]` and keeps `ignoredBuiltDependencies`.
- Root `package.json` keeps only workspace tooling: `turbo`, `@biomejs/biome`, `husky`, commitlint, `supabase`, `typescript`. Its scripts are `lint` (biome at root), `typecheck`/`test`/`build`/`dev` (via turbo), the `db:*` scripts, `prepare`, `check`. App dependencies move to `apps/web/package.json` (name `@jarso/web`).
- `turbo.json` defines the tasks:
  - `typecheck` depends on `^typecheck`.
  - `test`
  - `build` outputs `.next/**`, excluding `.next/cache/**`.
  - `dev` is persistent.
  - `eval:guide`

  Env passthrough covers the `NEXT_PUBLIC_*` placeholders CI uses.
- **Internal packages ship TypeScript source.** They have no build step: `exports` point at `src/*.ts`. Web lists them in `transpilePackages`. Metro reads TS source natively in step 5. *(my call: fewest moving parts, no dist drift)*
- **Package names:** `@jarso/web`, `@jarso/core`, `@jarso/content`, `@jarso/db`, `@jarso/brand`, `@jarso/tsconfig`. Dependencies use `workspace:*`.

### Dependency direction

```
apps/web ─┬─> core ─┬─> content
          │         └─> db (types only)
          ├─> content, db, brand
packages never depend on apps; core never depends on brand.
```

### Packages

- **`packages/tsconfig`:** `base.json` (strict, today's compiler options), `nextjs.json` (extends base, adds the Next plugin and `jsx: preserve`), `library.json` (extends base, `lib: ["ES2023", "DOM"]`, no `@types/node`). Core legitimately uses `fetch`, `crypto`, `TextEncoder`, `AbortSignal` and `console`, which come from the DOM lib. A stray `window`/`document`/`navigator`/`localStorage`/`indexedDB` is caught by Biome `noRestrictedGlobals` instead (see Biome). No `@types/node`, so `process`/`Buffer` fail typecheck. *(my call)*
- **`packages/content`:** `src/content/learning/**` moves as is. The entry point is `@jarso/content/learning`. It holds only JSON and the index. Zod validation stays in core's `learning`.
- **`packages/db`:** `src/database.types.ts` plus an `index.ts` that re-exports the `Tables`/`Enums` helpers now in `src/types/index.ts`. Web's `@/types` barrel re-exports `@jarso/db`, so existing imports keep working. Both `db:types` scripts point here.
- **`packages/brand`:**
  - `assets/` holds the `public/brand/**` PNGs.
  - `tokens.css` holds the `@theme` palettes, the type scale, the radius scale and the `:root`/`.dark` semantic variables, moved out of `globals.css`.

  Web keeps a copy step: `apps/web/public/brand` becomes a build-time copy (via a `predev`/`prebuild` script) because Next only serves `public/`. `globals.css` does `@import "@jarso/brand/tokens.css"`. The app icons in `src/app/` (favicon, OG images) stay in web. *(my call)*
- **`packages/core`:** `src/<module>/…` with an `exports` map of one subpath per module:
  - `lib` (money, dates, errors, action result types, logger, db-error)
  - `learning/content` is its **own subpath**, separate from `learning`, so the 184 KB of mission JSON never rides along with `export * from "@jarso/core/learning"`. In web only `features/learning/server` imports it, keeping today's server-only guarantee. Mobile may import it directly (offline missions); that choice belongs to the step 5 spec. *(my call)*
  - `allowance`, `auth`, `diary`, `family`, `goals`, `guide`, `learning`, `ledger`, `notifications`, `offline`, `payments`, `profiles`, `requests`, `review`, `rules`
  - `config` (countries, helplines)

  `landing` doesn't move, because it's web marketing.

  Its only dependencies are `zod`, `@jarso/content` and `@jarso/db`. Tests live in `packages/core/tests/<module>/` and run in vitest's node environment with no setup file.

### What moves into core (per module)

These moves follow the audit tables. A module's "pure" files move as they are. Its "pure-after-fix" files get the fix in the same commit.

| Module | Moves | Fix on the way |
|---|---|---|
| lib | money, dates, errors, `ActionResult`/`ActionState`/`idle` (split out of `action.ts`), logger, db-error, `PAYMENT_PROVIDER_IDS`, `lib/payments/types.ts` | `createAction`, `fallback`, `cn`, `timed-fetch`, `api/` stay in web. Provider minimum-charge helpers `lib/payments/{stripe,razorpay}/currencies.ts` stay in web (server-only). Logger loses its `process.env` read: core exports `logger` + `configureLogger({ level?, json? })`, defaulting to `info` and readable output; web's `src/lib/logger.ts` becomes a thin file that reads `LOG_LEVEL`/`NODE_ENV`, calls `configureLogger`, and re-exports. It stays the rule-11 exception. *(my call)* |
| allowance | describe, due, schemas, types | types imports `@jarso/core/payments` types, not `@/lib/payments` |
| auth | types, schemas | `Route` → `string`. Web narrows `next` to `Route` where it redirects |
| diary | types, copy, schemas | |
| family | types, sent-ago, codes, currency, schemas | config imports → `@jarso/core/config` |
| goals | emoji, progress, predict, plan-note, schemas, types | |
| guide | copy, types, schemas, send-turn | `send-turn` takes `{ baseUrl, fetch }` options. The web call site passes `""` |
| learning | skills, grade, schemas, types, comeback, journey, steps, text, home-step, coaches; `content` as the separate `learning/content` subpath | `coachIds` moves from `jar-coach.tsx` to core and the component imports it. `content.ts` drops `server-only`; web's `features/learning/server` re-exports it behind its own `import "server-only"` and is the only web importer |
| ledger | categories, schemas, types, jar-scale, where-it-went | |
| notifications | schemas, types, `noticeText` | `links.ts` splits: `noticeText` → core, `noticeHref` (web routes) stays in web |
| offline | copy, outbox/{types, state, flush, submit, send, uuid} | see "Outbox" |
| payments | copy, types, status, schemas | |
| profiles | age, schemas, types | |
| requests | limit, types, describe, schemas, settle | `ParentRequestItem` type moves from the component to `types.ts` |
| review | types, build | |
| rules | types, describe, schemas | |
| config | countries, helplines | `site.ts`, `env.*` stay in web |

### Import strategy (keeps web churn small)

- Web's `@/lib` barrel re-exports the moved names from `@jarso/core/lib`, plus its own web-only exports.
- Each web feature barrel (`features/goals/index.ts`) does `export * from "@jarso/core/goals"`, plus its components and actions. Where a name would be exported twice, that barrel switches to explicit named re-exports (TS reports the ambiguity, so it can't slip through). *(my call)*
- Web's server and repository files that used relative imports (`../schemas`) switch to `@jarso/core/<module>`.

So web import sites stay the same, and only files inside a feature folder change. Core files import each other by subpath (`@jarso/core/lib`) across modules and by relative path within a module.

### Outbox

Core defines the following:

```ts
interface OutboxStore {
  put(item); remove(id); listForUser(userId); subscribe(listener): () => void;
}
interface OutboxPlatform {
  openStore(): Promise<OutboxStore | null>;
  isOffline(): boolean;
  withLock<T>(name: string, fn: () => Promise<T>): Promise<T>;  // web: navigator.locks; mobile: in-process
  fetch: typeof fetch; baseUrl: string; headers?(): Promise<Record<string,string>>;
  onNetworkFailure(): void; onNetworkSuccess(): void;
}
```

- `flush`, `submit` and `send` take the platform as an argument. Web builds a single `webOutboxPlatform` in `features/offline/outbox/platform.ts`, from the idb `store.ts`, `navigator` and the `use-online` reporters. The React hooks (`use-outbox`, `use-online`, `online-action`) stay in web.
- `flush` and `submit` tests move to core and run against an in-memory store. The `idb` store test stays in web with `fake-indexeddb`.

### Biome

- An override on `packages/core/**` and `packages/content/**` sets `noRestrictedImports` for the list above, plus `@/*`.
- The `src/components/ui/**` override becomes `apps/web/src/components/ui/**`.
- `files.includes` ignores `packages/db/src/database.types.ts`.
- The core override also sets `noRestrictedGlobals` for `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`, `location`.

### Web app move (step 1 detail)

- `git mv` moves the following into `apps/web/`: `src/`, `tests/`, `evals/`, `public/`, `next.config.ts`, `next-env.d.ts`, `playwright.config.ts`, `vitest.config.mts`, `vitest.eval.config.mts`, `components.json`, `vercel.json`, `tsconfig.json`.
- Playwright `local-supabase.ts` runs `supabase status` with `cwd` = repo root.
- `.gitignore` anchors become unanchored or `apps/web/`-scoped (`.next/`, `test-results/`, `playwright-report/`, `coverage/`, `evals/guide/results/`).
- `.claude/settings.json` deny rules add `./apps/*/.env*`.
- `.env.local` moves to `apps/web/.env.local`. **The user does this themselves**: the agent never reads or moves `.env*` files. The plan has an explicit pause right after the `git mv` for this, and the PR body carries a note for every other checkout. Root-level files the `db:*` scripts source stay at the root.
- CI:
  - **`ci.yml` verify** runs `pnpm turbo lint typecheck test build`.
  - **e2e** runs `pnpm --filter @jarso/web test:e2e` and uploads `apps/web/playwright-report`.
  - **migrations** stay as they are.
  - **`guide-evals.yml`** runs `pnpm --filter @jarso/web eval:guide` and uses the artifact path `apps/web/evals/...`.
- Husky:
  - pre-commit keeps `sh scripts/check-secrets.sh` + `biome check --staged`.
  - pre-push becomes `pnpm turbo typecheck test`.
- **Clean-up:**
  - delete `junk/` and root `.mypy_cache/` (both are untracked and gitignored, so this is a local deletion only)
  - remove the stale root `tsconfig.tsbuildinfo` and `test-results/`
  - check that `.gitignore` covers both at every depth

### Docs

- New: `docs/adr/0015-monorepo-and-mobile.md`.
- Update `src/` paths and commands in:
  - `CLAUDE.md`
  - `docs/{architecture,conventions,security,auth,design,api,testing,domain,deploy,database}.md`
  - `docs/adr/0001`, `0009` and `0013` (path notes only)
  - `.claude/skills/*`
  - `.claude/agents/*`
  - `tasks/lessons.md`
- CLAUDE.md gains a short rule: pure domain code lives in `packages/core`, and web feature modules hold components, server code and the barrel that re-exports core.
- Historical specs and plans are left alone.

## Built to grow

The user asked for a structure that stays clean and maintainable as the codebase grows. These rules make that hold. They go into CLAUDE.md and `docs/architecture.md`, and tooling enforces them where it can.

1. **One-way dependencies, checked by tooling.** apps → packages, never back. Within packages: `core` → `content`, `db`; `brand` and `tsconfig` → nothing. pnpm's isolated linker already fails an import of a package that isn't declared, and Biome `noRestrictedImports` blocks `@/*`, React, Next and server code inside core.
2. **Core modules form a layered graph, not a web.** The bottom layer is `lib` and `config`, which import no feature. Next come the leaf features, then the composites that may import leaves (`review`, `learning`, `diary`, `notifications`). A cross-module import names the subpath (`@jarso/core/goals`) and never a file inside it. Each module's `index.ts` is its public API. A Biome override per layer blocks upward imports (`lib` can't import any feature).
3. **The same feature name across layers.** A domain area is `packages/core/src/<x>` (rules, schemas, copy) plus `apps/web/src/features/<x>` (components, server, barrel), later joined by `apps/mobile/src/features/<x>` (screens). The `new-feature` skill is updated to scaffold the core module first and the app modules on top.
4. **Platform code behind ports.** When core needs storage, network, locks or time, it declares an interface and each app supplies an implementation. The outbox is the first case and sets the pattern; core never feature-detects a platform.
5. **Turbo caching per package.** `typecheck`, `test` and `lint` are cached per package, so a web-only change doesn't re-run core's tests and the reverse. CI runs `turbo --affected` on PRs.
6. **When to split a package.** Core stays a single package with subpaths until one of three things happens: a module needs its own dependency that other consumers mustn't get, a module needs a different release or build, or core's test run passes about 60 s. At that point the module becomes `packages/<x>`. Its subpath already acts as a package boundary, so the import sites don't change much. *(my call: splitting now would mean 15 package.json files for no gain)*
7. **Tests live next to the code they cover.** Each package owns `tests/` mirroring its `src/`. Core tests run in node only, so they stay fast as they grow.

## Delivery

- One branch per step, off `main`: `refactor/monorepo-web` (step 1), `refactor/shared-packages` (step 2), `refactor/core-<group>` (step 3, a few PRs). Each step is a squash-merged PR with a Conventional Commits title.
- Commits happen only when the user says.
- Step 3 goes in this order, so each PR stays reviewable:
  1. `lib` + `config`
  2. leaf features: ledger, goals, rules, profiles, auth, payments, allowance
  3. learning (with content), diary, requests, family, notifications, guide
  4. review
  5. offline outbox last
- **Verification per step:**
  - `pnpm turbo lint typecheck test build` is green.
  - The unit test count before equals the count after, summed across packages.
  - Playwright runs in PR CI (no local Supabase, per the cloud-only setup).
  - From step 2 onward, a Vercel preview deploy of the PR loads and signs in. Step 1 is checked after merge instead (see Decided).

## Left to the builder

- The exact turbo `inputs`/`outputs` and caching settings.
- Whether the `public/brand` copy step is a tiny node script or `cpy`.
- How to split commits within each step's PR (the global commit rules apply).
- Vitest workspace vs per-package configs. Per-package is the default.

## Steps 4–5 (outline only, later specs)

- **Step 4, mobile API:**
  - Make `createClient()` accept `Authorization: Bearer`.
  - `withApi` skips the same-origin check for Bearer requests. The proxy skips `/api/v1` Bearer calls.
  - Child PIN sign-in route returns tokens instead of cookies.
  - `/api/v1` routes for about 50 mutations, plus the reads.
  - `packages/api-client` parses the `{ data } | { error: { code, message, details } }` envelope with core types.
  - Open question for that spec: should mobile reads go through `/api/v1`, or straight to Supabase with RLS? This decides most of step 4's size.
- **Step 5, `apps/mobile`:**
  - Expo Router + NativeWind + react-native-reusables.
  - An MMKV `OutboxStore` and NetInfo platform.
  - Expo push as a new channel next to VAPID web push.
  - An Expo deep-link scheme in Supabase redirect URLs.
  - Intl and crypto polyfills checked on Hermes.
  - JS brand tokens.
  - Parent and child flows both in scope.
