# Security

This repository is **public**, and so are the agent session logs in `.claude-logs/` (the hackathon judges read them). Users are children. Those two facts drive everything below. Review guidance lives in the `security-auditor` agent; day-to-day agent rules live in the `public-repo-security` skill; this page is the policy and the runbook.

## What must never enter the repo

- Credentials of any kind: Supabase secret or publishable keys, personal access tokens, Anthropic/OpenAI keys, GitHub tokens, database connection strings, OAuth client secrets, SMTP passwords, private keys.
- `.env` files other than `.env.example`. Placeholders in `.env.example` must not look like real keys (`sb_secret_…`, not a 40-character string).
- Children's personal data: real names, emails, messages, diary entries, screenshots of real accounts. Fixtures use obviously fake values.
- Internal URLs that carry tokens (signed storage URLs, magic links, invite links).

The Supabase **project URL** and its project ref are not secrets; they ship to every browser in `NEXT_PUBLIC_SUPABASE_URL`. The **publishable key** is designed to be public but still does not belong in the repo, because rotating it then requires a commit.

## Where secrets live

| Secret | Lives in | Read by |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | Host env vars (server only) | `src/lib/supabase/admin.ts` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Host env vars (public) | browser + server clients |
| Anthropic API key (future) | Host env vars (server only) | guide service only |
| `CRON_SECRET` (future) | Host env vars | cron Route Handlers |
| Supabase access token, project DB password | CI repository secrets | migration job |
| Local copies | `.env.local` (gitignored) | `pnpm dev` |

Every variable is declared in `src/config/env.client.ts` or `env.server.ts`; nothing else reads `process.env` except the isomorphic logger.

## Layers that keep secrets out

1. **Agent permissions.** `.claude/settings.json` denies the agent reading `.env*` files, `~/.claude`, and running `supabase db push`, `gh secret` or `vercel env pull`. The agent therefore never has a secret to leak into a transcript.
2. **Log redaction.** `.claude/hooks/extract-log.py` masks credential-shaped strings (Supabase, Anthropic, OpenAI, Resend, GitHub, AWS, Google, Slack, JWTs, connection strings, bearer tokens, PEM blocks, `KEY=value` lines, `"password": "…"` literals) and non-GitHub email addresses before writing a log. Redaction is a net, not a licence; rule 17 in `CLAUDE.md` still forbids putting a secret in a prompt.
3. **Pre-commit.** `scripts/check-secrets.sh` (Husky `pre-commit`) blocks staged `.env` files and credential-shaped strings in added lines.
4. **CI.** The `secrets` job runs gitleaks with `.gitleaks.toml` over the full history on every push and PR.
5. **GitHub.** Secret scanning and push protection are enabled on the repository; GitHub rejects pushes containing known token formats and alerts on anything that slips through. Dependabot watches npm and Actions dependencies.

All three pattern lists (`extract-log.py`, `check-secrets.sh`, `.gitleaks.toml`) must be updated together when a new credential type enters the project.

## Application controls

- **Auth:** Supabase Auth, cookie sessions via `@supabase/ssr`, JWT verified with `getClaims()`; see `docs/auth.md`.
- **Authorization:** RLS on every table, per-operation policies, `(select auth.uid())`; the admin client only after explicit checks.
- **CSRF:** Server Actions are protected by Next.js origin checks. `withApi` rejects non-GET Route Handler calls whose `Origin` matches neither the app URL nor the request host.
- **CORS:** Route Handlers are same-origin; no permissive CORS headers on cookie-authenticated routes.
- **Input:** Zod on every external input; PostgREST parameterises queries; plpgsql uses `set search_path = ''`.
- **Output:** React escaping; guide output rendered as text or HTML-escaped Markdown; `AppError` messages only, never raw errors.
- **Headers:** `next.config.ts` sets `nosniff`, `X-Frame-Options: DENY`, referrer policy, permissions policy and HSTS. Add a Content-Security-Policy when the first third-party script arrives.
- **Open redirects:** `safeNextPath()` for every post-login target.
- **Children's data:** collect the minimum (FR09, `CLAUDE.md` rule 15); never log emails, names or message bodies; the guide never asks for personal or account information. Rate-limit keys and lockout rows store SHA-256 hex of IPs and (normalised) emails, never the raw values; an invitation's `parent_email` is cleared when it is accepted.
- **Client IP:** `getClientIp` (`src/features/family/server/client-ip.ts`) trusts the first `x-forwarded-for` hop. That is safe only because Vercel overwrites the header with the real client address. Self-hosting or putting another proxy or CDN in front means changing it to read that platform's trusted header (or the socket address); otherwise a client can pick its own IP and dodge the per-IP limits and per-source PIN lockout.
- **Child passwords:** children sign in with a PIN only. `/login` refuses the child email domain, and the child's random password is rotated on every PIN sign-in and PIN reset (`docs/auth.md`).

## Rotation runbook

Assume any secret that touched a commit, a log, a chat or a screenshot is compromised, even if it was deleted a minute later. Rotate first, clean up second.

1. **Rotate at the source.**
   - Supabase secret/publishable key: Dashboard → Project Settings → API Keys → create a new key, update the host env vars, redeploy, then revoke the old key.
   - Supabase access token (`sbp_…`): Dashboard → Account → Access Tokens → revoke; create a new one for CI.
   - Database password: Dashboard → Project Settings → Database → reset; update CI secrets.
   - Anthropic key: Console → API Keys → disable; create a new key; update host env vars.
   - GitHub token: Settings → Developer settings → revoke.
2. **Remove it from the repo.** A follow-up commit is not enough for a public repo because history is public. Rewrite history (`git filter-repo` or GitHub's documented process), force-push, and ask GitHub Support to purge cached views. Tell collaborators to re-clone.
3. **Fix the log.** If it reached `.claude-logs/`, redact the file, extend the `REDACTIONS` list so the shape is caught next time, and commit both.
4. **Check for use.** Review Supabase auth and API logs and the provider's usage page for the exposure window.
5. **Write it down.** One paragraph in `docs/operations.md` (create it if missing): what leaked, for how long, what was rotated, what changed to prevent a repeat.

## Review checklist for PRs that touch auth, data or secrets

- `assertUser()` / `requireUser()` present; RLS policies for every operation on new tables.
- No new `process.env` reads outside `src/config`.
- No new credential type without updating the three pattern lists.
- No real emails, names or keys in tests, fixtures, docs or logs.
- `security-auditor` agent run and its findings addressed.
