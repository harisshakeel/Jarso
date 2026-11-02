# Monorepo and shared core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Jarso into a pnpm + Turborepo workspace with the web app in `apps/web` and all pure domain code, plus its tests, in `packages/core`. Web behaviour does not change.

**Architecture:** This is three PR-sized phases.
1. Move the app into `apps/web` unchanged.
2. Extract the leaf packages (`tsconfig`, `db`, `content`, `brand`).
3. Extract `packages/core` one module group at a time.

Packages ship TypeScript source through `exports` subpaths, and web consumes them with `transpilePackages`. The web barrels re-export core, so import sites in web stay the same.

**Tech Stack:** pnpm 10 workspaces (isolated linker), Turborepo, Next.js 16, TypeScript 5 strict, Biome 2.6, Vitest 5, Playwright, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-11-02-monorepo-shared-core-design.md`. It is binding, so read it in full before any task.

## Global Constraints

- The `CLAUDE.md` hard rules apply. Biome is the only linter. Never use `console.log`. Money stays in integer minor units.
- **Commits:** each task ends with its own focused Conventional Commit (subject 60 characters or fewer, no AI attribution), committed by the controller after review. Pushing a branch and opening its PR happens only at the end of each PR's task group, and only after the user confirms.
- **Never read, print, move or `cat` any `.env*` file.** The user moves `.env.local` themselves (Task 1, step 5).
- No Docker and no local Supabase. Playwright and pgTAP run only in PR CI. Locally, verify with `lint`, `typecheck`, `test` and `build`.
- No behaviour, copy, schema or migration changes. If a moved file needs more than the fix the spec names, stop and report.
- **Three stacked PRs** (user decision):
  - **PR 1** `refactor/monorepo-web` (off `main`): Tasks 1–3.
  - **PR 2** `refactor/shared-packages` (off PR 1): Tasks 4–7.
  - **PR 3** `refactor/shared-core` (off PR 2): Tasks 8–14.
  - Each PR is retargeted to `main` once the one below it merges.
- Package names are `@jarso/web`, `@jarso/core`, `@jarso/content`, `@jarso/db`, `@jarso/brand` and `@jarso/tsconfig`. Internal dependencies use `workspace:*`.
- Declare `react` only in `apps/web/package.json`. Never at the root or in a package.
- Packages have no build step. `exports` point at `./src/**/*.ts`.
- **Test-count invariant.** Baseline is 165 unit test files (145 of them under `tests/features` + `tests/lib`). The sum of test files and passing tests across all packages must equal the baseline at the end of every task. A test file split in two counts as a move as long as every `it` survives.
- Run `pnpm turbo lint typecheck test build` at the end of every task, from Task 1 on. If vitest runs out of memory, add `--pool=forks --maxWorkers=2`.

## Module move recipe (used by Tasks 9–12)

For each module `<m>` in a task's list:
1. `git mv apps/web/src/features/<m>/<file>.ts packages/core/src/<m>/<file>.ts` for each file in the spec's "What moves" row.
2. Apply the row's fix. Inside the module, keep imports relative. Across modules, use `@jarso/core/<other>`.
3. Write `packages/core/src/<m>/index.ts` re-exporting the moved files, and add `"./<m>": "./src/<m>/index.ts"` to core's `exports`.
4. In `apps/web/src/features/<m>/index.ts`, replace the moved re-exports with `export * from "@jarso/core/<m>";`. Switch to named re-exports only where `tsc` reports an ambiguity.
5. In web files inside `features/<m>/` that imported the moved files relatively (`../schemas`, `./types`), point them at `@jarso/core/<m>`.
6. `git mv` the matching pure tests from `apps/web/tests/features/<m>/` to `packages/core/tests/<m>/`, and rewrite `@/features/<m>…` and `@/lib` imports to `@jarso/core/<m>` / `@jarso/core/lib`.
7. Run `pnpm turbo lint typecheck test` and check that the test count is unchanged.

## Review Focus

1. **Mission content leaking into the browser bundle** after `learning` moves. Content must stay server-only on web. The test is in Task 11, step 6.
2. **An outbox item saved in IndexedDB by the old build must still flush after Task 13.** It covers purchases queued offline across the deploy. The DB name `jarso-outbox`, version `1`, store `items` and the `OutboxItem` shape must not change. The test is in Task 13, step 2.
3. **Two tabs flushing at once must send each item only once**, so the lock must still wrap the drain. The test is in Task 13, step 2.
4. **`LOG_LEVEL` and JSON log format in production** must still apply after the logger split. Otherwise prod logs lose structure. The test is in Task 9, step 2.
5. **Vercel crons and the deploy after the Root Directory flip.** `apps/web/vercel.json` must be the one Vercel reads. The check is in Task 3's post-merge checklist.

---

## PR 1: `refactor/monorepo-web`

### Task 1: Workspace root and web app in `apps/web`

**Files:**
- Move (`git mv`) into `apps/web/`: `src/`, `tests/`, `evals/`, `public/`, `next.config.ts`, `playwright.config.ts`, `vitest.config.mts`, `vitest.eval.config.mts`, `components.json`, `vercel.json`, `tsconfig.json`
- Create: `apps/web/package.json`, `turbo.json`
- Modify: root `package.json`, `pnpm-workspace.yaml`, `biome.json`, `.gitignore`, `.claude/settings.json`, `apps/web/tests/e2e/local-supabase.ts`

**Interfaces:**
- Produces:
  - workspace package `@jarso/web`
  - root scripts `lint`, `typecheck`, `test`, `build`, `dev`, `check`, `db:*`, `prepare`
  - turbo tasks `typecheck`, `test`, `build`, `dev`, `test:e2e`, `eval:guide`

- [ ] **Step 1: Record the baseline.** Run `pnpm test 2>&1 | tail -5` on `main` and write the test-file and test counts into the task report.
- [ ] **Step 2: Move the files** with `git mv`, using the list above. `next-env.d.ts` is gitignored, so delete it at the root instead.
- [ ] **Step 3: Split the `package.json` files.**
  - **`apps/web/package.json`:** name `@jarso/web`, private. It takes every `dependencies` entry and every dev dependency except `@biomejs/biome`, `husky`, the `@commitlint/*` packages and `supabase`. Scripts: `dev`, `build`, `start`, `typecheck` (`next typegen && tsc --noEmit`), `test` (`vitest run`), `test:watch`, `test:e2e`, `eval:guide`.
  - **Root `package.json`:** name `jarso`. It keeps `packageManager`, `engines` and those tooling dev dependencies, plus `turbo` and `typescript`. Scripts:
    - `lint`: `biome check .`
    - `typecheck`: `turbo typecheck`
    - `test`: `turbo test`
    - `build`: `turbo build`
    - `dev`: `turbo dev --filter @jarso/web`
    - `check`: `pnpm lint && pnpm typecheck && pnpm test`
    - `db:*` unchanged for now (Task 5 repoints `db:types`)
    - `eval:guide`: `pnpm --filter @jarso/web eval:guide`
    - `test:e2e`: `pnpm --filter @jarso/web test:e2e`
    - `prepare`: `husky`
- [ ] **Step 4: Add the workspace config.**
  - `pnpm-workspace.yaml` adds `packages: ["apps/*", "packages/*"]`.
  - `turbo.json`:
    - `typecheck` has `dependsOn ["^typecheck"]`.
    - `test` has `dependsOn ["^typecheck"]`.
    - `build` has `outputs [".next/**", "!.next/cache/**"]` and `env ["NEXT_PUBLIC_*"]`.
    - `dev` is persistent and uncached.
    - `test:e2e` and `eval:guide` are uncached.
  - Run `pnpm install`. The lockfile changes, and that is expected.
- [ ] **Step 5: PAUSE for the user.** Ask them to run `! mv .env.local apps/web/.env.local`, and to move any other `.env.*` they use for the app. Root-level env backups that the `db:*` scripts source stay at the root. Don't continue until they confirm.
- [ ] **Step 6: Fix paths.**
  - **`biome.json`:**
    - Ignore `apps/web/src/types/database.types.ts`, `**/playwright-report` and `**/test-results`.
    - The ui override path becomes `apps/web/src/components/ui/**`.
  - **`.gitignore`:** unanchor `/.next/`, `/coverage`, `/test-results/`, `/playwright-report/`, `/blob-report/` and `/evals/guide/results/`, writing them as `.next/` and so on. Add `.turbo/`.
  - **`.claude/settings.json` deny rules:** add read and edit patterns for `./apps/*/.env*` that mirror the existing `./.env*` ones.
  - **`local-supabase.ts`:** the `supabase status` `execSync` gets `cwd` set to the repo root, resolved with `new URL("../../../../", import.meta.url)` or with `path.resolve(__dirname, "../../../..")`.
- [ ] **Step 7: Verify.** Run `pnpm turbo lint typecheck test build` and expect it to pass with the baseline count. Then run `pnpm --filter @jarso/web start` and `curl -s localhost:3000/api/health`, which should return 200.
- [ ] **Step 8: Checkpoint.**

### Task 2: CI, hooks and evals for the new layout

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/guide-evals.yml`, `.husky/pre-push`

- [ ] **Step 1: Update `ci.yml`.**
  - **verify job:** run `pnpm lint` and then `pnpm turbo typecheck test build`, keeping the placeholder `NEXT_PUBLIC_*` env.
  - **e2e job:** run `pnpm test:e2e`. The artifact path becomes `apps/web/playwright-report`, and `supabase start` still runs at the root.
  - **migrations and secrets jobs:** leave them as they are.
- [ ] **Step 2: Update `guide-evals.yml`.** Use `pnpm eval:guide`, and set the artifact to `apps/web/evals/guide/results/report.json`.
- [ ] **Step 3: Update `.husky/pre-push`.** It runs `pnpm typecheck && pnpm test`, which now goes through turbo. Pre-commit stays the same.
- [ ] **Step 4: Verify.** `actionlint` passes if it is installed; otherwise check YAML validity with `pnpm dlx yaml-lint`. Real verification happens in the PR's CI run.
- [ ] **Step 5: Checkpoint.**

### Task 3: Phase-1 docs, ADR and clean-up

**Files:**
- Create: `docs/adr/0015-monorepo-and-mobile.md`
- Modify: `docs/adr/README.md` (index), `CLAUDE.md` (Commands and paths), `docs/{architecture,conventions,security,auth,design,api,testing,domain,deploy,database}.md`, `docs/adr/{0001,0009,0013}*.md`, `.claude/skills/*/SKILL.md`, `.claude/skills/production-readiness/references/*.md`, `.claude/agents/*.md`, `tasks/lessons.md`
- Delete (local, untracked): `junk/`, `.mypy_cache/`, `tsconfig.tsbuildinfo`, `test-results/`

- [ ] **Step 1: Write ADR 0015** in the `0000-template.md` format, dated 2026-11-02 with status Accepted.
  - **Context:** most users are on mobile, and both parents and kids use it from day one.
  - **Decision:** the spec's layout, internal TS-source packages, the isolated linker and React per app.
  - **Consequences:** web barrels re-export core, step 4 is sized at about 50 actions plus reads, and the Hermes Intl/crypto caveats.
- [ ] **Step 2: Rewrite the paths.** Change `src/…` to `apps/web/src/…` and `tests/…` to `apps/web/tests/…` in every file listed above. Commands become root `pnpm …` or `pnpm --filter @jarso/web …`. Leave `docs/superpowers/**` alone.
- [ ] **Step 3: Clean up.** Delete the untracked items listed above, then check that `git status --ignored` shows `tsconfig.tsbuildinfo` and `test-results/` ignored at every depth.
- [ ] **Step 4: Verify.** `grep -rn "\bsrc/" CLAUDE.md docs/*.md docs/adr .claude/skills .claude/agents | grep -v "apps/web/src\|packages/"` should return nothing, apart from deliberate mentions of the historical layout.
- [ ] **Step 5: Checkpoint, and write the post-merge checklist for the PR body:**
  1. The user flips Vercel Root Directory to `apps/web` immediately after merge.
  2. Check that the production deploy of `main` succeeds.
  3. Check that `/` loads, a parent signs in, and a child signs in with a PIN.
  4. In Vercel → Settings → Cron Jobs, check that both crons are listed: `/api/cron/push` and `/api/cron/payments/auto-charge`.
  5. Other checkouts must move their `.env.local` to `apps/web/`.

---

## PR 2: `refactor/shared-packages`

### Task 4: `packages/tsconfig`

**Files:**
- Create: `packages/tsconfig/{package.json,base.json,nextjs.json,library.json}`
- Modify: `apps/web/tsconfig.json`, `apps/web/package.json`

**Interfaces:**
- Produces:
  - **`@jarso/tsconfig/base.json`:** today's strict options, without `lib`, `jsx`, `plugins`, `paths` or `incremental`.
  - **`nextjs.json`:** base, plus `lib [dom, dom.iterable, esnext]`, `jsx react-jsx`, the next plugin, `incremental` and `allowJs false`.
  - **`library.json`:** base, plus `lib ["ES2023","DOM"]`, with no `types` from node (`"types": []`).

- [ ] **Step 1: Create the three configs** described above.
- [ ] **Step 2: Point web at them.** `apps/web/tsconfig.json` extends `@jarso/tsconfig/nextjs.json` and keeps `paths`, `include` and `exclude`.
- [ ] **Step 3: Verify.** `pnpm turbo typecheck` passes.
- [ ] **Step 4: Checkpoint.**

### Task 5: `packages/db`

**Files:**
- Move: `apps/web/src/types/database.types.ts` → `packages/db/src/database.types.ts`
- Create: `packages/db/{package.json,tsconfig.json,src/index.ts}`
- Modify: `apps/web/src/types/index.ts`, root `package.json` (`db:types`, `db:types:linked`), `biome.json` (the generated-file ignore path)

**Interfaces:**
- Produces: `@jarso/db` exporting `Database`, `Tables`, `TablesInsert`, `TablesUpdate`, `Enums`, `Json`, and whatever else `src/types/index.ts` exports today.

- [ ] **Step 1: Move the generated types.** `git mv` the file, then write `packages/db/src/index.ts` as `export * from "./database.types";` together with the helpers currently in `apps/web/src/types/index.ts`.
- [ ] **Step 2: Re-export from web.** `apps/web/src/types/index.ts` becomes `export * from "@jarso/db";`. Add `@jarso/db` to web's `dependencies` and `transpilePackages`.
- [ ] **Step 3: Repoint the type scripts.** `db:types` writes `> packages/db/src/database.types.ts`, and so does `db:types:linked`.
- [ ] **Step 4: Verify.** `pnpm turbo lint typecheck test build` passes. `pnpm db:types:linked` only runs if the user says so, since it is a hosted call.
- [ ] **Step 5: Checkpoint.**

### Task 6: `packages/content`

**Files:**
- Move: `apps/web/src/content/learning/**` → `packages/content/src/learning/**`
- Create: `packages/content/{package.json,tsconfig.json}` (exports `"./learning": "./src/learning/index.ts"`)
- Modify: `apps/web/src/features/learning/content.ts` (import `@jarso/content/learning`), `apps/web/next.config.ts` (`transpilePackages`), `apps/web/package.json`

- [ ] **Step 1: Move the content.** `git mv` the folder, create the package, and repoint the single importer.
- [ ] **Step 2: Verify.** `pnpm turbo lint typecheck test build` passes. The learning content tests (`tests/features/learning/content.test.ts`) still pass.
- [ ] **Step 3: Checkpoint.**

### Task 7: `packages/brand`

**Files:**
- Move: `apps/web/public/brand/**` → `packages/brand/assets/**`
- Create:
  - `packages/brand/{package.json,tokens.css}`, with exports `"./tokens.css"` and `"./assets/*"`
  - `apps/web/scripts/copy-brand.mjs`
- Modify:
  - `apps/web/src/app/globals.css`
  - `apps/web/package.json` (`predev` and `prebuild`, both running `node scripts/copy-brand.mjs`)
  - `.gitignore` (`apps/web/public/brand/`)

- [ ] **Step 1: Move the tokens.** Cut these blocks verbatim from `globals.css` into `tokens.css`: the `@theme` palette and type-scale block, the `:root` block and the `.dark` block. `globals.css` keeps its tailwind, tw-animate and shadcn imports and `@custom-variant`, adds `@import "@jarso/brand/tokens.css";` after `tailwindcss`, and keeps `@theme inline` and the base layers.
- [ ] **Step 2: Add the copy script.** `copy-brand.mjs` copies `packages/brand/assets` into `apps/web/public/brand`, and it is idempotent.
- [ ] **Step 3: Verify.** Run `pnpm turbo build`. Diff the compiled CSS before and after: `grep -o "\-\-primary:[^;]*" apps/web/.next/static/**/*.css` should give the same values for light and dark as on `main`. Then start the app with the `run` skill and screenshot `/` in light and dark; it should look the same as `main`.
- [ ] **Step 4: Checkpoint**, then open PR 2. The preview deploy must load and sign in.

---

## PR 3: `refactor/shared-core`

### Phase 3a: foundation

### Task 8: `packages/core` scaffold and purity enforcement

**Files:**
- Create: `packages/core/{package.json,tsconfig.json,vitest.config.mts,src/.gitkeep,tests/.gitkeep}`
- Modify: `biome.json`, `apps/web/next.config.ts` (`transpilePackages`), `apps/web/package.json`

**Interfaces:**
- Produces:
  - `@jarso/core`, whose dependencies are `zod`, `@jarso/content` and `@jarso/db`, and whose devDependencies are `vitest` and `@jarso/tsconfig`. Its scripts are `typecheck` (`tsc --noEmit`) and `test` (`vitest run`). Its vitest config uses `environment: "node"` and `include: ["tests/**/*.test.ts"]`.
  - **Biome override for `packages/core/**` and `packages/content/**`:**
    - `noRestrictedImports` with paths `react`, `react-dom`, `server-only`, `@supabase/ssr`, `idb`, and patterns `next`, `next/*`, `@/*`, `@jarso/brand*`.
    - `noRestrictedGlobals` with `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`, `location`.
  - **Layer override for `packages/core/src/{lib,config}/**`:** `noRestrictedImports` with patterns `@jarso/core/*`, except `@jarso/core/lib` and `@jarso/core/config`.

- [ ] **Step 1: Write a failing purity probe.** Create the temporary file `packages/core/src/probe.ts` containing `import { useState } from "react"; export const x = window; void useState;`.
- [ ] **Step 2: Run `pnpm biome check packages/core`.** Expect it to fail, but not yet with the rule names.
- [ ] **Step 3: Add the package and Biome overrides** described in Interfaces.
- [ ] **Step 4: Re-run `pnpm biome check packages/core`.** Expect errors from both `noRestrictedImports` and `noRestrictedGlobals`. Then delete `probe.ts`. Do the same with `packages/core/src/lib/probe.ts` importing `@jarso/core/goals`: expect a layer error, then delete it.
- [ ] **Step 5: Run only affected packages on PRs.** In `ci.yml`, on `pull_request` the verify job runs `pnpm turbo typecheck test build --affected`. This needs `fetch-depth: 0` on checkout. On `push` to `main` it still runs everything.
- [ ] **Step 6: Verify.** `pnpm turbo lint typecheck test` passes. Core reports "no test files", so set `passWithNoTests: true` until Task 9.
- [ ] **Step 7: Checkpoint.**

### Task 9: `core/lib` and `core/config`

**Files:**
- Move to `packages/core/src/lib/`: `money.ts`, `dates.ts`, `errors.ts`, `db-error.ts`, `payments-types.ts` (from `apps/web/src/lib/payments/types.ts`)
- Move to `packages/core/src/config/`: `countries.ts`, `helplines.ts`
- Create: `packages/core/src/lib/{logger.ts,action-result.ts,index.ts}`, `packages/core/src/config/index.ts`
- Modify:
  - `apps/web/src/lib/{index.ts,logger.ts,action.ts}`
  - `apps/web/src/lib/payments/types.ts`: becomes a re-export
  - `apps/web/src/config/index.ts`
- Tests to `packages/core/tests/lib/`: `money`, `dates`, `errors`, `db-error`, plus a new `logger.test.ts`, and the `ActionResult` cases from `action.test.ts` split out into `action-result.test.ts`

**Interfaces:**
- Produces:
  - **`@jarso/core/lib`:**
    - everything `money`, `dates`, `errors` and `db-error` export today
    - `ActionResult<T>`, `ActionState<T>` and `idle` (moved verbatim from `action.ts`)
    - `PAYMENT_PROVIDER_IDS`, `isPaymentProviderId`, and the payment provider types
    - `logger` (`debug`, `info`, `warn`, `error` with the same signatures)
    - `configureLogger(opts: { level?: "debug"|"info"|"warn"|"error"; json?: boolean }): void`
  - `@jarso/core/config` exports `countries` and `helplines`, with the same names as today.

- [ ] **Step 1: Move the files** and the four test files using the recipe, then rewrite their imports to `@jarso/core/lib`.
- [ ] **Step 2: Write the failing `packages/core/tests/lib/logger.test.ts`:**
  - `it("drops info below a warn level")`: call `configureLogger({ level: "warn" })`, spy on `console.info`, call `logger.info("x")`, and expect the spy not to have been called. Then `logger.warn("y")` should call `console.warn` once.
  - `it("writes one JSON string in json mode")`: call `configureLogger({ level: "info", json: true })`, then `logger.info("hi", { a: 1 })`. `console.info` gets one argument, and `JSON.parse` of it matches `{ level: "info", message: "hi", a: 1 }`.
  - `it("defaults to info and readable output")`: in a fresh module (`vi.resetModules`), `logger.debug` is dropped, and `logger.info("m")` calls `console.info("[info] m", "")`.
- [ ] **Step 3: Run `pnpm --filter @jarso/core test`.** Expect it to fail because `configureLogger` is not exported.
- [ ] **Step 4: Implement the core logger.** Copy `serialize` and `write` from today's logger. The level and json mode live in module state, set by `configureLogger`, and the module has no `process` reference.
- [ ] **Step 5: Make web's logger a thin wrapper.** `apps/web/src/lib/logger.ts` becomes: read `LOG_LEVEL` and `NODE_ENV` exactly as now, call `configureLogger({ level, json: isProd })`, then `export { logger, configureLogger } from "@jarso/core/lib"`. Keep its rule-11 comment.
- [ ] **Step 6: Update web's `@/lib` barrel.** `apps/web/src/lib/index.ts` re-exports from `@jarso/core/lib` the names that now live there. It keeps `./action` (now only `createAction`, which imports its types from core), `./fallback`, `./logger`, `./timed-fetch` and `./utils`. Do the same for `@/config`, using `@jarso/core/config`.
- [ ] **Step 7: Verify.** `pnpm turbo lint typecheck test build` passes, and the test count is the baseline plus the 3 new logger tests.
- [ ] **Step 8: Checkpoint.**

---

### Phase 3b: features

### Task 10: Leaf features: ledger, goals, rules, profiles, auth, payments, allowance

Apply the recipe to each module, in the order given in the heading. Here are the files, fixes and tests for each.

| Module | Files to core | Fix | Tests to core |
|---|---|---|---|
| ledger | categories, schemas, types, jar-scale, where-it-went | none | categories, jar-scale, where-it-went |
| goals | emoji, progress, predict, plan-note, schemas, types | none | plan-note, predict, progress, schemas |
| rules | types, describe, schemas | none | describe, schemas |
| profiles | age, schemas, types | the `@/types` import becomes `@jarso/db` | age, schemas |
| auth | types, schemas | `Route` type becomes `string`; web's sign-in action casts `next` to `Route` where it redirects | schemas |
| payments | copy, types, status, schemas | types import from `@jarso/core/lib` | copy, schemas, status |
| allowance | describe, due, schemas, types | types import payment types from `@jarso/core/lib` | describe, due, schemas |

- [ ] **Step 1: Apply the recipe** to each module in order. Run `pnpm turbo typecheck test` after each one.
- [ ] **Step 2: Add the leaf-layer override.** In `biome.json`, an override on `packages/core/src/{ledger,goals,rules,profiles,auth,payments,allowance}/**` makes `noRestrictedImports` block `@jarso/core/{learning,diary,requests,family,notifications,guide,review,offline}`, so leaves can't import composites. Probe it the same way as in Task 8, step 4.
- [ ] **Step 3: Verify.** `pnpm turbo lint typecheck test build` passes and the test count is unchanged.
- [ ] **Step 4: Checkpoint.**

### Task 11: Composite features: learning, diary, requests, family, notifications, guide

| Module | Files to core | Fix | Tests to core |
|---|---|---|---|
| learning | skills, grade, schemas, types, comeback, journey, steps, text, home-step, coaches. Separately, `content.ts` goes to `packages/core/src/learning/content.ts`, exported as `"./learning/content"` | `coachIds`/`CoachId` move from `components/brand/jar-coach.tsx` to `core/learning/coaches.ts`, and `jar-coach.tsx` imports them. `content.ts` drops `import "server-only"`. `apps/web/src/features/learning/server/content.ts` is `import "server-only"; export * from "@jarso/core/learning/content";`. The core `learning/index.ts` does **not** export content | comeback, content, grade, home-step, journey, steps |
| diary | types, copy, schemas | none | copy, schemas |
| requests | limit, types, describe, schemas, settle | the `ParentRequestItem` type moves from `components/parent-request-items.tsx` to `core/requests/types.ts`, and the component imports it | describe, limit, schemas, settle |
| family | types, sent-ago, codes, currency, schemas | config imports become `@jarso/core/config` | codes, currency, schemas, sent-ago |
| notifications | schemas, types, and `noticeText` (from `links.ts`, into `core/notifications/text.ts`) | `noticeHref` stays in web's `links.ts` and imports `noticeText`'s helpers from core | schemas; the `noticeText` cases of `links.test.ts` (the split file) |
| guide | copy, types, schemas, send-turn | `sendTurn` gains a final `opts: { baseUrl: string; fetch?: typeof fetch } = { baseUrl: "" }`, and the request URL is `` `${opts.baseUrl}/api/v1/guide/turns` ``. Web call sites don't change | send-turn |

- [ ] **Step 1: Apply the recipe** to each module in the table's order.
- [ ] **Step 2: Add the `baseUrl` test to `packages/core/tests/guide/send-turn.test.ts`.** `it("posts to the given base URL")`: call it with `{ baseUrl: "https://api.example", fetch: mockFetch }` and expect `mockFetch` to have been called with `"https://api.example/api/v1/guide/turns"`. Run it, see it fail, implement, and see it pass.
- [ ] **Step 3: Grep for content importers.** `grep -rn "core/learning/content" apps/web/src` must return only `features/learning/server/content.ts`.
- [ ] **Step 4: Repoint web's learning server code.** Every web importer of the old `features/learning/content` now imports `features/learning/server/content` (it is already server-side).
- [ ] **Step 5: Verify.** `pnpm turbo lint typecheck test build` passes and the test count is unchanged.
- [ ] **Step 6: Check content stays out of the browser bundle (Review Focus 1).** Pick a mission title string from `packages/content/src/learning/missions/1-*.json`, then run `grep -rl "<that title>" apps/web/.next/static`. It must return nothing. Compare with `main` as well: it returned nothing there too.
- [ ] **Step 7: Checkpoint.**

### Task 12: review

- [ ] **Step 1: Apply the recipe.** `types` and `build` move. Their imports of the goals, learning and ledger barrels become `@jarso/core/{goals,learning,ledger}`. `tests/features/review/build.test.ts` moves to core.
- [ ] **Step 2: Verify.** `pnpm turbo lint typecheck test build` passes and the test count is unchanged.
- [ ] **Step 3: Checkpoint.**

---

### Phase 3c: outbox

### Task 13: Offline outbox behind ports

**Files:**
- Move to `packages/core/src/offline/`: `copy.ts`, `outbox/{types,state,flush,submit,send,uuid}.ts`
- Create: `packages/core/src/offline/outbox/ports.ts`, `packages/core/tests/offline/memory-store.ts`, `apps/web/src/features/offline/outbox/platform.ts`
- Modify: `apps/web/src/features/offline/outbox/store.ts` (implements `OutboxStore`), `use-outbox.ts`, `online-action.ts`, `index.ts`, and every web caller of `flushOutbox` / `submitToOutbox`
- Tests:
  - to core: `state`, `uuid`, `flush`, `submit`, `send`, and `test-utils.ts`
  - staying in web: `store.test.ts` (fake-indexeddb), `use-outbox`, `use-online`, `online-action`

**Interfaces:**
- Produces, in `ports.ts`:
  ```ts
  export interface OutboxStore {
    put(item: OutboxItem): Promise<void>;
    remove(id: string): Promise<void>;
    listForUser(userId: string): Promise<OutboxItem[]>; // oldest first: createdAt, then id
    subscribe(listener: () => void): () => void;
  }
  export interface OutboxPlatform {
    openStore(): Promise<OutboxStore | null>;
    isOffline(): boolean;
    withLock<T>(name: string, fn: () => Promise<T>): Promise<T>;
    fetch: typeof fetch;
    baseUrl: string;
    headers?(): Promise<Record<string, string>>;
    onNetworkFailure(): void;
    onNetworkSuccess(): void;
  }
  ```
- The changed signatures take `platform: OutboxPlatform` as their first parameter, and their other parameters stay the same:
  - `sendToServer(platform, item)`
  - `drainOutbox(platform, userId, send)`
  - `flushOutbox(platform, userId)`
  - `submitToOutbox(platform, …)`
- Web provides `webOutboxPlatform: OutboxPlatform` from `platform.ts`:
  - `openStore` is today's `open()`.
  - `isOffline` is `() => navigator.onLine === false`.
  - `withLock` uses `navigator.locks.request` when available, and otherwise calls `fn()` directly.
  - `fetch` is `globalThis.fetch`, and `baseUrl` is `""`.
  - The network callbacks are `reportNetworkFailure` and `reportNetworkSuccess` from `use-online.ts`.
- Web's `features/offline/index.ts` re-exports core's offline module and exposes wrappers `flushOutbox(userId)` and `submitToOutbox(...)` bound to `webOutboxPlatform`. This keeps every existing call site.

- [ ] **Step 1: Write `memory-store.ts`.** It is an in-memory `OutboxStore` backed by a `Map` and sorted by `createdAt`, then `id`. Also write `makePlatform(overrides)` in `test-utils.ts`.
- [ ] **Step 2: Write the failing core tests (Review Focus 2 and 3):**
  - `flush.test.ts` gets `it("flushes an item stored by the previous build")`. The store holds a literal `OutboxItem` written in today's shape: kind `purchase`, a payload without `category`, `attempts: 0`, `status: "waiting"`. After `flushOutbox(platform, userId)`, `send` was called once with that item, and the store is empty.
  - `flush.test.ts` gets `it("sends each item once when two flushes overlap")`. `withLock` is a real promise-chain mutex. Run `await Promise.all([flushOutbox(p, u), flushOutbox(p, u)])` with 3 items and expect `send` to have been called 3 times.
  - `send.test.ts` gets `it("posts to baseUrl with platform headers")`. Use `baseUrl: "https://api.example"` and `headers: async () => ({ Authorization: "Bearer t" })`. Expect the fetch URL `"https://api.example/api/v1/outbox"` with that header.
- [ ] **Step 3: Run `pnpm --filter @jarso/core test`.** Expect failures, because the ports don't exist yet.
- [ ] **Step 4: Move the files and add the ports** to make the tests pass.
  - `send` replaces the `use-online` imports with `platform.onNetworkFailure` and `platform.onNetworkSuccess`. It keeps `AbortSignal.timeout(15_000)`.
  - `flush` and `submit` replace `open()` and `navigator.*` with `platform` calls.
  - The moved `flush`, `submit` and `send` tests switch from `fake-indexeddb` to the memory store.
- [ ] **Step 5: Wire web.** `store.ts` exports an object satisfying `OutboxStore`. Its DB name `jarso-outbox`, version `1`, store `items`, index `userId` and its `BroadcastChannel` stay unchanged. Create `platform.ts` and the barrel wrappers.
- [ ] **Step 6: Verify.** `pnpm turbo lint typecheck test build` passes, with the baseline count plus the new tests. The offline Playwright specs (`offline-mission`, `offline-parent`, `offline-purchase`) run in PR CI and must pass.
- [ ] **Step 7: Checkpoint.**

### Task 14: Core rules in docs and skills

**Files:**
- Modify: `CLAUDE.md`, `docs/architecture.md`, `docs/conventions.md`, `docs/testing.md`, `.claude/skills/new-feature/SKILL.md`, `.claude/agents/code-reviewer.md`

- [ ] **Step 1: Update `CLAUDE.md`.** Hard rule 1 now says that pure domain code (schemas, types, rules, copy) lives in `packages/core/src/<name>`, and that `apps/web/src/features/<name>` holds components, `server/` and a barrel that re-exports `@jarso/core/<name>`. Add rule 18 on core purity: no React, Next, server or platform globals; ports for platform needs; the layers from the spec's "Built to grow". Point rule 11's logger exception at `apps/web/src/lib/logger.ts`.
- [ ] **Step 2: Copy the spec's "Built to grow" section into `docs/architecture.md`.** Include the dependency diagram and the "when to split a package" trigger.
- [ ] **Step 3: Update the `new-feature` skill.** It scaffolds `packages/core/src/<x>` (schemas, types, logic, tests in `packages/core/tests/<x>`) first, then the web module.
- [ ] **Step 4: Update the code-reviewer agent.** Add checks for the core purity and layer rules.
- [ ] **Step 5: Verify.** `pnpm lint` passes, since Markdown is ignored. Re-read `CLAUDE.md` once to confirm it is consistent.
- [ ] **Step 6: Checkpoint**, then open PR 3.
