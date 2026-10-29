# Jarso

Pocket-money learning app for children aged 11–14 (parent + child accounts, allowance schedules, Spend/Save jars, savings requests, savings goals, money diary, daily missions; AI money guide in a later version). Scope: `REQUIREMENTS.md`. Domain map + invariants: `docs/domain.md`.

Full-stack Next.js 16 (App Router) + Supabase. pnpm, TypeScript strict, Tailwind v4 + shadcn/ui, Zod, Biome, Vitest, Playwright.

@AGENTS.md

## Read before working

- Product scope & domain invariants: `REQUIREMENTS.md`, `docs/domain.md`
- Architecture & folder layout: `docs/architecture.md`
- Conventions (naming, barrels, errors, env): `docs/conventions.md`
- Schema / migrations / RLS: `docs/database.md`
- Auth: `docs/auth.md` · Backend entry points: `docs/api.md` · Tests: `docs/testing.md`
- UI and brand: `docs/design.md` (tokens, type, components, voice). Logos in `public/brand/`.
- Next.js 16 APIs differ from training data — check `node_modules/next/dist/docs/` before using an unfamiliar API.

## Commands

```bash
pnpm dev                 # dev server
pnpm check               # lint + typecheck + unit tests — run before declaring work done
pnpm build               # needs NEXT_PUBLIC_* env (see .env.example)
pnpm test:e2e            # Playwright
pnpm db:migration <name> # new migration → then pnpm db:reset && pnpm db:types
```

## Hard rules

1. **Feature modules.** Domain code lives in `src/features/<name>/` (`components/`, `schemas.ts`, `types.ts`, `server/{actions,service,repository}.ts`). `src/app` only routes and composes.
2. **Index barrels.** Every module exposes an `index.ts`. Cross-module imports go through the barrel (`@/features/auth`, `@/lib`, `@/components/ui`, `@/config`, `@/types`) — never deep paths into another module. Inside a module use relative imports.
3. **Never mix server and client in a barrel.** Server-only API lives in `features/<f>/server/index.ts` beginning with `import "server-only"`. Direct-import exceptions: `@/lib/supabase/{client,server,admin,proxy}`, `@/config/env.server`.
4. **Layering:** route/action → service → repository → Supabase. Only repositories touch table/column names. No business logic in `app/`.
5. **Auth:** call `requireUser()` (pages) or `assertUser()` (actions/APIs) from `@/features/auth/server`. Proxy redirects are optimistic only. Never use `getSession()` on the server.
6. **Cache Components are on.** Anything reading cookies/headers/searchParams/Supabase-server renders inside `<Suspense>`. Don't await the session at a layout's top level.
7. **Database:** schema changes only via `supabase/migrations`. Every new table enables RLS with explicit per-operation policies in the same migration. Regenerate and commit `src/types/database.types.ts`.
8. **Admin client** (`@/lib/supabase/admin`) bypasses RLS — trusted server jobs only, after explicit authz.
9. **Validation:** every external input (forms, JSON bodies, params) parsed with Zod. Server Actions via `createAction`; Route Handlers via `withApi` + `parseBody`.
10. **Errors:** throw `AppError(code, safeMessage, { cause })`. Never leak raw errors to users. Use `logger` from `@/lib`; `console.log` is banned.
11. **Env:** add vars to `src/config/env.{client,server}.ts` + `.env.example`. Never read `process.env` elsewhere (sole exception: `src/lib/logger.ts`, which is isomorphic).
12. **Biome only** for lint/format. No ESLint/Prettier.
13. After `pnpm dlx shadcn add <x>`, export it from `src/components/ui/index.ts`.
14. **Money** is integer minor units end to end; practice and recorded money never mix; jar transfers are not income.
15. **Child users.** Simple, encouraging copy. Collect minimum data. AI guide stays within FR09 boundaries.
16. **Commits** follow Conventional Commits (`feat: …`, `fix(scope): …`), enforced by commitlint on `commit-msg`. PR titles are validated the same way (squash-merge subject).
17. **Public repo.** Everything here, including `.claude-logs/`, is public. Never read `.env*` files, never print, echo, paste or quote a credential (Supabase keys, Anthropic keys, tokens, connection strings), and never ask the user to paste one into chat. Use placeholders like `sb_secret_…`. If a real secret appears in any output, stop, tell the user, and follow the rotation runbook in `docs/security.md`. See the `public-repo-security` skill.

## Workflows

Project skills in `.claude/skills/`: `new-feature`, `db-migration`, `api-endpoint`, `server-action`, `ui-component`, `verify`, `production-readiness` (right-sized reliability, security and scaling decisions for ~60 users; consult it for any backend, cron, Claude API, migration or deploy change), `public-repo-security` (secret handling, logging hygiene and the rotation runbook for this public repo), `pr-review` (end-to-end pull request review with a merge verdict).
Subagents in `.claude/agents/`: `supabase-architect`, `code-reviewer`, `security-auditor`, `test-engineer`.

## Claude config is repo-scoped

All Claude configuration lives in this repo — `.claude/settings.json`, `.claude/hooks/`, `.claude/skills/`, `.claude/agents/`, this file. Never add or depend on anything in `~/.claude`. If a guide says to install into `~/.claude`, adapt it to the project equivalent (use `$CLAUDE_PROJECT_DIR` in hook commands).

## Session Logs

`.claude/settings.json` runs `.claude/hooks/extract-log.py` on `UserPromptSubmit`, `Stop` and `SubagentStop`, writing prompt + final-response transcripts to `.claude-logs/`. Each session file ends with a "Subagents" section: every subagent's dispatch prompts and handed-back reports. Always commit `.claude-logs/` with your changes.

The logs are public (hackathon evaluation). The hook redacts credential-shaped strings and non-GitHub email addresses before writing, `scripts/check-secrets.sh` blocks commits that still contain any, and CI runs gitleaks. Redaction is a safety net, not permission: still never put a secret in a prompt or response.
