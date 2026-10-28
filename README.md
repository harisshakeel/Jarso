# Jarso

Pocket-money learning app for children aged 11–14. See [REQUIREMENTS.md](./REQUIREMENTS.md).

**Stack:** Next.js 16 (App Router, Cache Components) · React 19 · TypeScript (strict) · Supabase (Postgres, Auth) · Tailwind v4 + shadcn/ui · Zod · Biome · Vitest · Playwright · pnpm

## Getting started

Prereqs: Node ≥ 22 (see `.nvmrc`), pnpm 10, Docker (for local Supabase).

```bash
pnpm install
cp .env.example .env.local
pnpm db:start                    # local Supabase; copy publishable + secret keys into .env.local
pnpm dev                         # http://localhost:3000
```

## Scripts

| Script | Does |
| --- | --- |
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm lint` / `lint:fix` | Biome check / autofix |
| `pnpm typecheck` | Route typegen + `tsc` |
| `pnpm test` / `test:watch` | Vitest |
| `pnpm test:e2e` | Playwright |
| `pnpm check` | lint + typecheck + test |
| `pnpm db:start` / `db:stop` / `db:reset` | Local Supabase |
| `pnpm db:migration <name>` | New migration |
| `pnpm db:types` | Regenerate DB types |
| `pnpm db:push` | Apply migrations to linked project |

## Contributing

Conventional Commits (`feat: …`, `fix(goals): …`) — enforced by commitlint and the Semantic PR check.

## Docs

Start at [docs/README.md](./docs/README.md). Architecture: [docs/architecture.md](./docs/architecture.md).
