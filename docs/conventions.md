# Conventions

## Tooling

- **pnpm** only. **Biome** for lint + format (`pnpm lint`, `pnpm lint:fix`) — no ESLint/Prettier.
- Husky hooks:
  - `pre-commit`: Biome on staged files + `pnpm typecheck`
  - `commit-msg`: commitlint (Conventional Commits)
  - `pre-push`: unit tests
- `pnpm check` = lint + typecheck + test. Must pass before any commit.

## Commits & PRs

[Conventional Commits](https://www.conventionalcommits.org): `type(scope?): subject`, lowercase subject, imperative, ≤ 72 chars.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Scope = feature module where useful (`feat(goals): add payments-remaining estimate`).

- Enforced locally by commitlint (`commitlint.config.ts`) and in CI on every PR commit.
- PR titles are checked by `.github/workflows/semantic-pr.yml` — they become the squash-merge commit.
- One logical change per commit.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Files & folders | kebab-case | `sign-in-form.tsx` |
| Components | PascalCase export | `SignInForm` |
| Hooks | `use-*.ts`, `useThing` | `use-debounce.ts` |
| Zod schemas | `<thing>Schema`, infer `<Thing>Input` | `signInSchema`, `SignInInput` |
| Server Actions | verb, `…Action` suffix when it clashes with a service | `signIn`, `updateProfileAction` |
| Services | verb + noun | `getProfile`, `updateProfile` |
| Repository fns | `find…`, `insert…`, `update…ById`, `delete…` | `findProfileById` |
| Migrations | `supabase migration new <snake_case>` | `create_profiles` |
| Tests | colocated `*.test.ts(x)`; e2e in `tests/e2e/*.spec.ts` | `schemas.test.ts` |

## Index barrels (required)

Every module exposes its public API through an `index.ts` barrel. Import from the barrel, never from internal files of **another** module.

| Barrel | Contents | Safe in client? |
| --- | --- | --- |
| `@/features/<f>` | components, schemas, types, server actions | ✅ |
| `@/features/<f>/server` | services, DAL (`import "server-only"`) | ❌ server only |
| `@/components/ui` | shadcn primitives | ✅ |
| `@/components/form` | `Field`, `FieldError`, `FormError` (design.md §6 Forms) | ✅ |
| `@/lib` | errors, logger, `createAction`, `cn` | ✅ |
| `@/lib/api` | Route Handler helpers | ❌ server only |
| `@/config` | `routes`, `siteConfig`, `clientEnv` | ✅ |
| `@/types` | generated DB types | ✅ (types only) |

Rules:

1. **Never mix server-only and client-safe exports in one barrel.** Server-only goes in `server/index.ts`, which starts with `import "server-only"`.
2. **Inside a module, use relative imports** (`./service`, `../schemas`) — never import your own barrel (causes cycles).
3. **Across modules, use the barrel** (`@/features/auth`, `@/lib`), never a deep path like `@/features/auth/components/sign-in-form`.
4. **Exceptions — environment entry points:** `@/lib/supabase/{client,server,admin,proxy}` and `@/config/env.server` are imported directly. They're intentionally separate so the wrong client can't be pulled into the wrong runtime.
5. Prefer `export *` for files you fully own; use named re-exports (`export { a, b } from`) when you want to hide internals (e.g. `server/actions`).
6. After `pnpm dlx shadcn add <x>`, add `export * from "./<x>";` to `src/components/ui/index.ts`.

## Server vs client

- Default to Server Components. Add `"use client"` only for interactivity/state/browser APIs, as low in the tree as possible.
- Fetch data in Server Components (pages/sections) and pass plain props to presentational components.
- Never import `@/features/*/server`, `@/lib/api`, `@/lib/supabase/server|admin`, or `@/config/env.server` from a `"use client"` file.

## Errors

- Throw `AppError(code, userSafeMessage, { cause })` for expected failures (`VALIDATION`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL`).
- `createAction` and `withApi` translate `AppError` → typed result / JSON with the right status. Anything else becomes `INTERNAL` and is logged — raw messages never reach the user.
- Don't `try/catch` around `redirect()`/`notFound()`; `createAction` already rethrows Next control-flow errors.

## Logging

Use `logger` from `@/lib` (structured JSON in production). `console.log` is a lint error. Never log tokens, passwords, or full user rows.

## Env vars

- Add to the Zod schema in `src/config/env.client.ts` (`NEXT_PUBLIC_*`) or `env.server.ts`, and to `.env.example`.
- Client vars must be referenced explicitly (`process.env.NEXT_PUBLIC_X`) so Next inlines them.
- Never read `process.env` directly elsewhere. Sole exception: `src/lib/logger.ts` reads `LOG_LEVEL`/`NODE_ENV` itself because it is imported by Client Components and cannot depend on `env.server`.

## Styling

Tailwind v4 + shadcn/ui (Base UI primitives). Compose classes with `cn()` from `@/lib`. Theme tokens live in `src/app/globals.css`.
