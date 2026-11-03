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
| `SUPABASE_SECRET_KEY` | Host env vars (server only) | `apps/web/src/lib/supabase/admin.ts` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Host env vars (public) | browser + server clients |
| `ANTHROPIC_API_KEY` | Vercel env vars (Production, sensitive); GitHub repository secret for the eval workflow | `features/guide/server/claude.ts` only (ADR 0010) |
| `STRIPE_SECRET_KEY` (`sk_test_…`, test mode only) | Vercel env vars (sensitive) | `apps/web/src/lib/payments/stripe/` only (ADR 0013) |
| `RAZORPAY_KEY_ID` (`rzp_test_…`, test mode only) | Vercel env vars (sensitive). The id is also passed to Razorpay Checkout in the browser by design, from the server page, not a `NEXT_PUBLIC_` var | `apps/web/src/lib/payments/razorpay/`; the save-card page (`apps/web/src/app/(app)/parent/payments/razorpay/`) |
| `RAZORPAY_KEY_SECRET` | Vercel env vars (sensitive) | `apps/web/src/lib/payments/razorpay/` only (ADR 0014) |
| `RAZORPAY_WEBHOOK_SECRET` | Vercel env vars (sensitive); the same value typed into the Razorpay test dashboard webhook | the Razorpay webhook verification in `apps/web/src/lib/payments/razorpay/` |
| `STRIPE_WEBHOOK_SECRET` (`whsec_…`) | Vercel env vars (sensitive). A separate value for `stripe listen` in `apps/web/.env.local` | the Stripe webhook verification in `apps/web/src/lib/payments/stripe/` |
| `CRON_SECRET` | Vercel env vars (sensitive), and the same value in Supabase Vault as `cron_secret`; Vercel sends it as the cron request's bearer token | `/api/cron/payments/auto-charge` and `app/api/cron/push/route.ts`; pg_cron reads the Vault copy through `trigger_auto_charge` |
| `VAPID_PRIVATE_KEY` | Vercel env vars (Production, sensitive) | `features/notifications/server/push.ts` only |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Host env vars (public: it is the `applicationServerKey` every browser receives) | the push toggle and the dispatcher |
| Supabase access token, project DB password | CI repository secrets | migration job |
| Local copies | `apps/web/.env.local` (gitignored) | `pnpm dev` |

Every variable is declared in `apps/web/src/config/env.client.ts` or `env.server.ts`; nothing else reads `process.env` except the isomorphic logger.

## Layers that keep secrets out

1. **Agent permissions.** `.claude/settings.json` denies the agent reading `.env*` files, `~/.claude`, and running `supabase db push`, `gh secret` or `vercel env pull`. The agent therefore never has a secret to leak into a transcript.
2. **Log redaction.** `.claude/hooks/extract-log.py` masks credential-shaped strings (Supabase, Anthropic, OpenAI, Resend, GitHub, AWS, Google, Slack, JWTs, connection strings, bearer tokens, PEM blocks, `KEY=value` lines, `"password": "…"` literals) and non-GitHub email addresses before writing a log. Redaction is a net, not a licence; rule 17 in `CLAUDE.md` still forbids putting a secret in a prompt.
3. **Pre-commit.** `scripts/check-secrets.sh` (Husky `pre-commit`) blocks staged `.env` files and credential-shaped strings in added lines.
4. **CI.** The `secrets` job runs gitleaks with `.gitleaks.toml` over the full history on every push and PR.
5. **GitHub.** Secret scanning and push protection are enabled on the repository; GitHub rejects pushes containing known token formats and alerts on anything that slips through. Dependabot watches npm and Actions dependencies.

All three pattern lists (`extract-log.py`, `check-secrets.sh`, `.gitleaks.toml`) must be updated together when a new credential type enters the project. They cover Razorpay key ids (`rzp_test_…`, `rzp_live_…`). The Razorpay key secret and webhook secret have no prefix, so no pattern finds them; keep them out of prompts, docs and tests entirely. The placeholder `rzp_test_` followed by only `X` characters is allowed in fixtures (blanked by `check-secrets.sh`, allowlisted in `.gitleaks.toml`).

## Application controls

- **Auth:** Supabase Auth, cookie sessions via `@supabase/ssr`, JWT verified with `getClaims()`; see `docs/auth.md`.
- **Authorization:** RLS on every table, per-operation policies, `(select auth.uid())`; the admin client only after explicit checks.
- **CSRF:** Server Actions are protected by Next.js origin checks. `withApi` rejects non-GET Route Handler calls whose `Origin` matches neither the app URL nor the request host.
- **CORS:** Route Handlers are same-origin, with one exception: `POST /api/v1/payments/razorpay/return` is `withApi(…, { crossOrigin: true })` because Razorpay Checkout posts a form to it. It reads no session, writes nothing, and answers only 303 to same-origin URLs it rebuilds from validated query values (the checkout page validates the same URLs), so it is neither a CSRF target nor an open redirect. The webhook routes never see a browser Origin and rely on their signature. No permissive CORS headers on cookie-authenticated routes.
- **Payments (ADR 0013, 0014):** test mode only (`STRIPE_SECRET_KEY` must be `sk_test_`/`rk_test_`, `RAZORPAY_KEY_ID` must be `rzp_test_`; live-mode events are rejected). Several providers can be on; each is on only when all its keys are set. Card numbers never reach Jarso; only the provider's references, brand and last 4 are stored. The webhook route authenticates by signature, the cron route by a constant-time bearer check, and both fail closed (404 when payments are off or `CRON_SECRET` is unset). `fake` is refused on Vercel production. Logs carry payment IDs, provider refs and failure codes, never payment-method details or raw payloads. Razorpay requires the customer's email and phone before it saves a card: Jarso asks the parent for their mobile number on every Razorpay save and passes it with the account email to Razorpay only. A typed email is never accepted: Razorpay finds customers by email and phone, so another parent's exact pair would return their customer and saved cards (the save-card order goes to the Razorpay customer found or created with that email and phone). Neither is stored (no column, audit detail or URL) or logged; a refusal is logged by Razorpay's code, reason and field name, never the value. Other Razorpay errors log their code, reason and source; the description only when the source is the account or Razorpay itself (`internal`, `razorpay`, `business`, e.g. a feature not enabled), and never if it contains an `@` or a run of 8+ digits. The child never sees card details or a failed charge.
- **Input:** Zod on every external input; PostgREST parameterises queries; plpgsql uses `set search_path = ''`.
- **Output:** React escaping; guide output rendered as text or HTML-escaped Markdown; `AppError` messages only, never raw errors.
- **Headers:** `apps/web/next.config.ts` sets `nosniff`, `X-Frame-Options: DENY`, referrer policy, permissions policy and HSTS. Add a Content-Security-Policy when the first third-party script arrives. Razorpay Checkout (`checkout.razorpay.com`, loaded only on `/parent/payments/razorpay`) is now that script; no CSP is set yet, so when one is added it must allow `checkout.razorpay.com` and `api.razorpay.com`.
- **Open redirects:** `safeNextPath()` for every post-login target.
- **Children's data:** collect the minimum (FR09, `CLAUDE.md` rule 15); never log emails, names or message bodies; the guide never asks for personal or account information. Rate-limit keys and lockout rows store SHA-256 hex of IPs and (normalised) emails, never the raw values; an invitation's `parent_email` is cleared when it is accepted.
- **The AI guide, Jarso (ADR 0010, 0011):** on per child by default, and a parent can turn it off at any time (told on the add-child form); look-ups of the child's own data run as the child (RLS), only after the input screen; contact details scrubbed before a message is stored or sent; input and output screens; transcripts written only by the server; message text blanked after 30 days; logs carry route, model, tokens and latency, never message text. The key never reaches the browser and is never in a `NEXT_PUBLIC_` variable.
- **Parents' details:** date of birth, country and gender live in `parent_details`, readable only by their owner (ADR 0008). Never log them or put them in audit details.
- **Client IP:** `getClientIp` (`apps/web/src/features/family/server/client-ip.ts`) trusts the first `x-forwarded-for` hop. That is safe only because Vercel overwrites the header with the real client address. Self-hosting or putting another proxy or CDN in front means changing it to read that platform's trusted header (or the socket address); otherwise a client can pick its own IP and dodge the per-IP limits and per-source PIN lockout.
- **Child passwords:** children sign in with a PIN only. `/login` refuses the child email domain, and the `on_auth_child_password_changed` trigger replaces any child password with an unknowable hash, so a child can never sign in by password (`docs/auth.md`).

## Rotation runbook

Assume any secret that touched a commit, a log, a chat or a screenshot is compromised, even if it was deleted a minute later. Rotate first, clean up second.

1. **Rotate at the source.**
   - Supabase secret/publishable key: Dashboard → Project Settings → API Keys → create a new key, update the host env vars, redeploy, then revoke the old key.
   - Supabase access token (`sbp_…`): Dashboard → Account → Access Tokens → revoke; create a new one for CI.
   - Database password: Dashboard → Project Settings → Database → reset; update CI secrets.
   - Anthropic key: Console → API Keys → disable; create a new key; update host env vars.
   - Stripe secret key (`sk_test_…`): Stripe dashboard (test mode) → Developers → API keys → roll the key (set an expiry on the old one, or none to cut it off at once); update `STRIPE_SECRET_KEY` on Vercel; redeploy.
   - Stripe webhook secret (`whsec_…`): Developers → Webhooks → the endpoint → Roll secret; update `STRIPE_WEBHOOK_SECRET` on Vercel; redeploy. Events signed with the old secret are rejected (400) until then, and Stripe retries them.
   - Razorpay key (`rzp_test_…` and its secret): Razorpay dashboard (test mode) → Account & Settings → API keys → regenerate (the old pair stops working at once); update `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on Vercel; redeploy. The key id is not secret on its own but is scanned for like one.
   - Razorpay webhook secret: Account & Settings → Webhooks → edit the webhook → set a new secret; update `RAZORPAY_WEBHOOK_SECRET` on Vercel; redeploy. Until then Razorpay events are rejected (400) and Razorpay retries them.
   - `CRON_SECRET`: generate a new value; update it in Vercel **and** in Supabase Vault in the same sitting (`select vault.update_secret(id, '<new cron secret ≥16 chars>') from vault.secrets where name = 'cron_secret'`, or edit it in the dashboard); redeploy. Until both match, pg_cron calls get 401 and the Vercel fallback covers the gap.
   - GitHub token: Settings → Developer settings → revoke.
2. **Remove it from the repo.** A follow-up commit is not enough for a public repo because history is public. Rewrite history (`git filter-repo` or GitHub's documented process), force-push, and ask GitHub Support to purge cached views. Tell collaborators to re-clone.
3. **Fix the log.** If it reached `.claude-logs/`, redact the file, extend the `REDACTIONS` list so the shape is caught next time, and commit both.
4. **Check for use.** Review Supabase auth and API logs and the provider's usage page for the exposure window.
5. **Write it down.** One paragraph in `docs/operations.md` (create it if missing): what leaked, for how long, what was rotated, what changed to prevent a repeat.

## Review checklist for PRs that touch auth, data or secrets

- `assertUser()` / `requireUser()` present; RLS policies for every operation on new tables.
- No new `process.env` reads outside `apps/web/src/config`.
- No new credential type without updating the three pattern lists.
- No real emails, names or keys in tests, fixtures, docs or logs.
- `security-auditor` agent run and its findings addressed.
