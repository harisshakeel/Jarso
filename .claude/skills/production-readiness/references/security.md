# Security and authentication

Users are children, so the bar is data minimisation plus the standard web controls. Supabase Auth, RLS and the host handle most of the heavy lifting; our job is not to undo it. `docs/auth.md` and the `security-auditor` agent cover review; this file maps the concepts.

## Secrets management — Do

Keeping credentials out of code and logs. Secrets live only in the host's environment variables and GitHub Actions secrets, validated by `src/config/env.server.ts`. `SUPABASE_SECRET_KEY` bypasses RLS; it never gets a `NEXT_PUBLIC_` prefix, never appears in logs, prompts, screenshots or `.claude-logs/` (session logs are committed in this repo, so anything pasted into a prompt is published). Rotate immediately on any doubt: Supabase lets you create a new secret key and revoke the old one. `.env*` is gitignored; keep it that way.

## IAM — Do

Who may do what. In Supabase: `anon` (signed-out), `authenticated` (signed-in, scoped by RLS to their own rows) and `service_role` (bypass, server only). Every table gets per-operation policies in the migration that creates it. Future parent/child roles should be modelled as data (a `guardians` table) with policies, not as a second auth system. On GitHub and the host: least privilege, branch protection on `main`, two-factor on.

## OAuth — Cheap

Delegated sign-in via Google, Apple and others. Supabase handles the dance; `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: <APP_URL>/auth/callback } })` from a client component, and the existing PKCE callback finishes it. Register the redirect URL on the provider and in Supabase. Most likely use: a parent signing in with Google.

## JWT rotation — Know

Short-lived access tokens refreshed by long-lived refresh tokens, and the signing keys themselves being rotated. `@supabase/ssr` refreshes tokens in `proxy.ts`; `getClaims()` verifies the signature against Supabase's published keys, which is why the DAL uses it instead of `getSession()`. Signing-key rotation is done in the Supabase dashboard if a key is suspected leaked; clients pick up the new key automatically.

## TLS — Know

Encrypted HTTP. The host and Supabase terminate TLS and redirect HTTP to HTTPS. `next.config.ts` already sends HSTS. Only local development uses `http://127.0.0.1`.

## Encryption at rest — Know

Data encrypted on disk. Supabase encrypts volumes and backups. Field-level encryption (Supabase Vault) is for secrets stored in the database, such as a per-user third-party token; Jarso stores none. Do not encrypt names or diary labels at field level; it breaks querying and buys little against the realistic threats.

## Encryption in transit — Know

Data encrypted between systems. Browser to app and app to Supabase are TLS. CI connecting to the database for migrations also uses TLS. Nothing to build.

## WAF — Know

A filter in front of the app that blocks known-bad requests. The host or Cloudflare offers one; enable it if abuse appears. Never write request filtering yourself; validate inputs with Zod and let the platform do signature-based blocking.

## DDoS protection — Know

Absorbing floods of traffic. Platform-level at both the host and Supabase. Our contribution is making expensive paths cheap to refuse: per-user rate limits on the guide so a compromised account cannot run up the Claude bill, and nothing expensive reachable while signed out.

## CORS — Do

Browser rules for which origins may call an API with scripts. Route Handlers are same-origin by default; the browser blocks other sites from reading responses. Do not add `Access-Control-Allow-Origin` to any route that authenticates with cookies. If a mobile app ever needs the API, it will send a bearer token, not cookies, and CORS can be scoped to it then.

## CSRF — Do

A malicious site making a signed-in browser perform an action. Server Actions are protected by Next.js origin checks. Cookie-authenticated Route Handlers that mutate (`PATCH /api/v1/me`) rely on Supabase cookies being `SameSite=Lax`, which blocks cross-site POST/PATCH in modern browsers, but add an explicit check that the `Origin` header equals `NEXT_PUBLIC_APP_URL` in `withApi` for non-GET methods. Belt and braces, five lines.

## SQL injection — Do

User input interpreted as SQL. PostgREST and supabase-js parameterise filters, so `.eq("id", userInput)` is safe. Unsafe spots: building `.or("…")` filter strings by concatenation, and `plpgsql` functions that build dynamic SQL. Use parameters, and `format('%I', …)` for identifiers and `%L` for literals if dynamic SQL is unavoidable. Functions keep `set search_path = ''`.

## XSS — Do

Script injected into pages. React escapes text by default. Risks are `dangerouslySetInnerHTML`, rendering the guide's Markdown through a library that allows raw HTML, and `href` values from users (`javascript:` URLs). Render guide output with a Markdown renderer configured to escape HTML, validate URLs with Zod's `z.url()` and allow only `http(s)`. Add a Content-Security-Policy header when the first third-party script arrives.

## SSRF — Cheap

The server fetching a URL an attacker controls, reaching internal services. Nothing in Jarso fetches user-supplied URLs today; `avatar_url` is stored and rendered by the browser. If a feature ever fetches URLs (link previews, avatar import), resolve the host, reject private and link-local ranges, allowlist schemes, and use `next/image` `remotePatterns` to restrict image hosts.
