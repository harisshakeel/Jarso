# Authentication & authorization

Supabase Auth with cookie sessions via `@supabase/ssr`.

## Layers

| Layer | File | Role |
| --- | --- | --- |
| Proxy | `src/proxy.ts`, `src/lib/supabase/proxy.ts` | Refreshes the session cookie on every request. **Optimistic** redirects: signed-out → `/sign-in/child` for `/child`, `/login?next=…` (query kept) for other `protectedRoutePrefixes`; signed-in → `/dashboard` for auth pages. |
| DAL | `src/features/auth/server/session.ts` | `getCurrentUser()` verifies the JWT (`getClaims`) and returns a narrow `SessionUser`. `requireUser(path)` for pages (redirects to `/login?next=<path>`), `assertUser()` for actions/APIs (throws 401). Memoised per request. It calls `connection()` first: partial prefetching would otherwise prerender it, and auth-js reads `Date.now()` in `getClaims()`. |
| Roles DAL | `src/features/family/server/dal.ts` | `requireRole(role, path)` for pages, `assertRole(role)` / `assertParentOf(childId)` for actions. Role comes from the approved membership, else the server-set `profiles.role`. Memoised per request. `assertRole("parent")` also refuses a parent without a completed profile (ADR 0008); use it for every new parent action. |
| RLS | `supabase/migrations/*` | Final authority. Even a bug in app code cannot read another user's rows. |

**Proxy is not security.** Every page, action and route handler that touches user data must call `requireUser()` / `assertUser()`.

## Rules

- Never trust `getSession()` on the server — it doesn't verify the JWT. Use `getCurrentUser()`.
- Don't add code between `createServerClient` and `getClaims()` in the proxy.
- When returning a different response from the proxy, use `redirectWithSession` so refreshed cookies + cache headers are kept.
- Session reads are request-time → render inside `<Suspense>`.
- Post-login redirects go through `safeNextPath()` (blocks open redirects).
- Expose only `SessionUser` to the client, never raw claims.
- Protect a new area by adding its prefix to `protectedRoutePrefixes` in `src/config/site.ts` **and** calling `requireUser(routes.<page>)` in its pages.

## Flows

- **Email + password:** `signIn` / `signUp` Server Actions in `src/features/auth/server/actions.ts`.
- **Email confirmation:** the email links to `/auth/confirm?token_hash=…&type=email&next=…`, which calls `verifyOtp` and redirects. No PKCE verifier cookie is needed, so the link works in any browser or device. `signUp` still sets `emailRedirectTo` to `<APP_URL>/auth/callback?next=<path>`; the template passes that URL as `next` and `nextFromEmailLink` unwraps it to `<path>` (same-origin only, then `safeNextPath`). A parent who signed up from `/invite?code=…` lands back there. Bad or used links go to `/login?error=auth_confirm`. Template: `supabase/templates/confirmation.html` (local, via `config.toml`); hosted, see below.
- **OAuth (and the default Supabase email template):** Supabase redirects to `/auth/callback?code=…`, which exchanges the PKCE code for a session. Only works in the browser that started the flow. Failures go to `/login?error=auth_callback`. Allowed redirect URLs live in `supabase/config.toml` (`additional_redirect_urls`) and the hosted project's Auth settings.
- **Sign-out:** `signOut` Server Action.
- **Roles:** see the Roles DAL row above. `/dashboard` is the role router: parents go to `/parent` (or `/parent/setup` before their family exists), children to `/child`.

## Children (ADR 0004)

**Identity.** A child is a real Supabase auth user, created only by the server with the admin client (`createChildAuthUser` in `src/features/family/server/child-auth.ts`): a synthetic, non-deliverable email `<uuid>@child.jarso.invalid`, a random password nobody knows, and `app_metadata.jarso_role = "child"`. `profiles.role` follows from app metadata only (never user metadata). GoTrue writes app metadata in an UPDATE after the insert, so a second trigger, `on_auth_user_app_metadata_updated`, applies the child role. Parents can't sign up or sign in at `/login` with the child domain (`signUpSchema`, `signInSchema`). A child session could still call GoTrue's `updateUser({ password })` and later sign in by password, skipping the PIN and its lockout, so the server rotates the child's password to a fresh random token (`rotateChildPassword`) on every successful PIN sign-in (before the session is minted) and on every PIN reset. GoTrue may end the child's other sessions when the password changes, so signing in on a second device can sign the first one out. A parent adds the child with `register_child` (nickname, PIN, consent); a child-started invitation ends the same way when the parent accepts it at `/invite`.

**PIN sign-in.** `/sign-in/child` takes family code, nickname and PIN. `childSignInAction` → `childSignIn` (`src/features/family/server/service.ts`):

1. Rate limits, counted on every attempt: `pin:ip:<iphash>` 20 per 15 min and `pin:family:<code>:<iphash>` 30 per hour, where `<iphash>` is the SHA-256 hex of the client IP (`getClientIp` reads the first `x-forwarded-for` hop; see `docs/security.md`). The family limit is per source so nobody can lock a whole family out from their own network.
2. `verify_child_pin` (admin client, service_role only) normalises the code (upper case, spaces and hyphens removed) and nickname (trimmed, case-insensitive) and returns `ok`, `invalid` or `locked`. It never raises, so the failure counters commit. Lockout is per (child, source = IP hash): five wrong PINs from one source lock that source for 15 min, doubling per lock up to 24 h, while the child can still sign in from home. As a safety cap against distributed guessing, 100 wrong PINs from all sources within 24 h lock the child everywhere until a parent resets the PIN. Every lock start is audited as `child.locked` (no IP, no PIN).
3. Copy: `invalid` → "Hmm, that didn't match. Check with your parent." (same for unknown family or nickname); `locked` or a rate limit → "Too many tries. Ask your parent or wait a little while."

**PIN reset.** `setChildPin` (parent of the child only) sets the PIN, which clears every lock, then rotates the child's password and deletes all of the child's auth sessions with `revoke_user_sessions` (service_role only). Refresh tokens die with the sessions, so every signed-in device is out once its current access token expires (`jwt_expiry`, 1 hour); pages that verify the token locally can still render until then.

**Session minting.** On `ok`, `mintChildSession` calls admin `generateLink({ type: "magiclink", email })` and then `verifyOtp({ type: "magiclink", token_hash })` on the request's cookie client. The result is a normal Supabase cookie session for the child, so the proxy, DAL and RLS treat it like any other user. It needs writable cookies: Server Action or Route Handler only. No email is sent.

**Redirects.** Signed out, `/child` goes to `/sign-in/child` (proxy and `requireRole("child")`), never to the parent login. A child opening a parent page lands on `/child`; a parent opening `/child` lands on `/parent`. The e2e suite (`tests/e2e/onboarding.spec.ts`) covers all of these.

## Children: removal, rename, settings

A parent manages children from Settings (gear in the header → `/parent/settings`): rename (same nickname rules as adding), reset PIN, and remove. Removing is irreversible and audited: the database disables the child first (`remove_child`: membership removed, nickname freed, PIN credentials deleted), then every session is revoked and, while the child has no money history, the auth identity is deleted (ADR 0007). Children get `/child/settings` with theme and sign-out only; a parent manages the rest.

## Children: deployment prerequisite

Child accounts are created through the admin client, so every environment that creates children needs `SUPABASE_SECRET_KEY` (Vercel production and preview, local `.env.local`). Without it `createAdminClient()` throws before GoTrue is called and the parent sees the generic "couldn't create the child account" message; that was the hosted failure recorded in PR #10. GoTrue's Admin `createUser` only syntax-checks the email, so the synthetic `.invalid` domain is fine on hosted.

## Hosted setup

Most of it is applied from the repo. `supabase/config.toml` carries a `[remotes.production]` block keyed by the project ref; `supabase config diff` previews and `supabase config push --yes` applies it to the linked project, leaving the base values for local development untouched. Applied on 2026-10-29: Site URL `https://jarso.vercel.app`; redirect URLs `https://jarso.vercel.app/auth/callback`, `https://jarso.vercel.app/auth/callback**`, `http://localhost:3000/auth/callback`, `http://localhost:3000/auth/callback**`; secure password change on. The block also pins the hosted-only values (email confirmation on, secure email change on, MFA on, hosted pooler sizes) so a push can never downgrade them to the local settings. Run `supabase config diff` after editing either section; the only expected remaining difference is the confirmation template (below).

Still by hand in the dashboard:

1. **Email confirmation: temporarily OFF (since 2026-10-29).** Switched off in `[remotes.production.auth.email]` so sign-up needs no email while everything is test data. REQUIRED ON before any real family joins: `list_my_invitations` shows a parent the invitations addressed to their `auth.users.email` and trusts `email_confirmed_at`; with confirmation off, sign-up auto-confirms any address, so anyone could sign up with a parent's email and see, then accept, invitations meant for them. Turning it on needs custom SMTP first (item 2). Secure email change stays on.

2. **Custom SMTP, before anyone outside the team signs up.** On the free tier with Supabase's default email provider two limits apply: confirmation emails are only delivered to addresses that belong to the project's team, and email templates cannot be customised (the config push of the template is rejected with "Email template modification is not available for free tier projects using the default email provider"). Configure a custom SMTP provider (Resend offers SMTP once a sending domain is verified) under Authentication → SMTP Settings; after that, push the template with `supabase config push` and raise `auth.rate_limit.email_sent` in the `[remotes.production]` block.

3. **Confirm signup template** (applies once custom SMTP exists). Subject `Confirm your Jarso account`, body:

```html
<h2>Confirm your email</h2>

<p>Tap the link below to confirm your email and finish setting up Jarso. You can open it on any device.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo | urlquery }}">Confirm my email</a>
</p>
<p>If you didn't sign up for Jarso, you can ignore this email.</p>
```

Keep it identical to `supabase/templates/confirmation.html`; the push reads that file. Until it is applied, the hosted project sends Supabase's default template, whose link goes through the PKCE code exchange at `/auth/callback` and therefore only works in the browser that started the sign-up. `/auth/confirm` (token hash, any browser) becomes active with the custom template.

4. **Secure password change** is on (pushed). It makes a password change need a recent sign-in, which narrows the child-password bypass described under *Children*. It doesn't close it on its own: a freshly minted child session counts as recent. The full fix, if the plan allows auth hooks, is a **Password Verification Attempt** hook that rejects users whose `app_metadata.jarso_role` is `child`; until then the password rotation on every PIN sign-in and reset is what ends a self-set password.

## Adding OAuth providers

Enable in `supabase/config.toml` (`[auth.external.<provider>]`) and the dashboard, then call `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: <APP_URL>/auth/callback } })` from a client component.
