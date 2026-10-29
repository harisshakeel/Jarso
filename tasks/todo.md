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
- [x] Add child fails on hosted — resolved 2026-10-29. Root cause was the Vercel deployment missing `SUPABASE_SECRET_KEY`, so `createAdminClient()` threw before GoTrue was called; the `.invalid` domain and password policy were not involved (GoTrue's Admin `createUser` only syntax-checks the email). Key added to Vercel (production + preview, sensitive); add child verified against the hosted project from localhost (parent setup → add child → child PIN sign-in, no errors).

## Should fix
- [ ] Password rotation on every PIN sign-in signs the child out of other devices (GoTrue logs out all sessions on password change). Rotate only on PIN reset; rely on hosted "Secure password change".
- [ ] `invite:global` exhaustible by one IP: denied requests still increment. Check global cap only after per-IP/per-email limits pass.

## Hosted setup (user)
- [x] `pnpm db:push` (all 8 migrations applied; `migration list --linked` matches).
- [ ] Confirm-signup email template — blocked on the free tier with the default email provider; needs custom SMTP first (docs/auth.md → Hosted setup).
- [x] Redirect URLs (production + localhost, plain and `**`) — applied via `supabase config push` from `[remotes.production]`.
- [x] "Secure password change" on — applied via config push. Email confirmation temporarily OFF for development (must be on before real families).
- [ ] Delete leftover test users (`smoke…@gmail.com`, `child.jarso`).

## Later
- [ ] Retention cron for expired invitations + old `usage_counters` (slice 2, pg_cron).
- [ ] Deferred minors: orphan auth user on ambiguous create; child sign-out landing; nickname charset rejects combining marks; `nicknameConflict` maps every CONFLICT; 5th wrong PIN copy; `findProfileRole` default; FK `on delete`; DAL unit tests.

# Slice 3 (purchases, limits, undo)

- [x] SQL: notifications, money rules, purchases with overspend rule, undo (pgTAP)
- [x] Server modules: `rules`, `diary` (record, undo), ledger history with purchases and Undone lines
- [x] Screens: child purchase sheet and undo; parent money rules page with overspend switch
- [x] E2E: `tests/e2e/purchases.spec.ts`
- [ ] Slice 4: savings deposits and withdrawals as requests (`requests` table, `create_request`, `decide_request`, `complete_request`), withdrawal cap and auto-approve / auto-confirm rules in use, request screens, notices for requests
