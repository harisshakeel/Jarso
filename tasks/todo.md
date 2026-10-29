# Foundation scaffold

Stack: Next.js 16 (App Router, Cache Components, `proxy.ts`), TypeScript strict, pnpm,
Tailwind v4 + shadcn/ui, Supabase (`@supabase/ssr`), Zod, Biome, Husky, Vitest, Playwright.

## Plan

- [x] Base Next.js app (create-next-app) moved into repo
- [x] Tooling: Biome, Husky pre-commit, strict tsconfig, scripts
- [x] Env: Zod-validated `env/server.ts` + `env/client.ts`, `.env.example`
- [x] Core lib: errors, action result type, logger, route-handler wrapper, `cn`
- [x] Supabase: browser/server/admin clients, proxy session refresh, typed DB, `supabase/` dir (config, migrations, seed)
- [x] Auth feature module: schemas, server actions, DAL (`getCurrentUser`), login form, callback route, protected `(app)` group
- [x] App shell: root layout, error/not-found/global-error, health API route
- [x] shadcn/ui init + base components
- [x] Tests: Vitest config + sample unit test, Playwright config + smoke test
- [x] CI: GitHub Actions (lint, typecheck, test, build, e2e, migrations)
- [x] Commitlint (commit-msg hook + CI) and Semantic PR title workflow
- [x] Index barrels per module; rule documented
- [x] Domain doc from REQUIREMENTS.md
- [x] Session-log hooks — repo-scoped: `.claude/settings.json` + `.claude/hooks/extract-log.py`
- [x] Project `.claude/settings.json`
- [x] Docs: `docs/` (architecture, conventions, database, auth, testing, ADRs)
- [x] Claude: `CLAUDE.md`, skills, subagents
- [x] Verify: `pnpm lint`, `typecheck`, `test`, `build` all green

## Review

- `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` 12/12 ✅ · `pnpm build` ✅ · Playwright smoke 3/3 ✅ (against prod server, placeholder Supabase env)
- Not verified: migrations against a live local Supabase (Docker not started); CI workflows not yet run on GitHub.

# Slice 1 follow-ups (after PRs #9, #10)

## Blocking
- [ ] Add child fails on hosted: GoTrue admin `createUser` errors (local OK). Get the logged code (`Child auth user creation failed`): `email_address_invalid` → change synthetic child email domain (ADR 0004, `childEmail`, sign-in/up domain checks); `weak_password` → reset hosted password rules or mixed-class token.

## Should fix
- [ ] Password rotation on every PIN sign-in signs the child out of other devices (GoTrue logs out all sessions on password change). Rotate only on PIN reset; rely on hosted "Secure password change".
- [ ] `invite:global` exhaustible by one IP: denied requests still increment. Check global cap only after per-IP/per-email limits pass.

## Hosted setup (user)
- [ ] `pnpm db:push` (6 migrations); confirm `revoke_user_sessions` can delete `auth.sessions`.
- [ ] Confirm-signup email template from docs/auth.md → Hosted setup.
- [ ] Redirect URLs `<app>/auth/callback**`.
- [ ] Enable "Secure password change"; keep default password strength.
- [ ] Delete leftover test users (`smoke…@gmail.com`, `child.jarso`).

## Later
- [ ] Retention cron for expired invitations + old `usage_counters` (slice 2, pg_cron).
- [ ] Deferred minors: orphan auth user on ambiguous create; child sign-out landing; nickname charset rejects combining marks; `nicknameConflict` maps every CONFLICT; 5th wrong PIN copy; `findProfileRole` default; FK `on delete`; DAL unit tests.
