# Authentication & authorization

Supabase Auth with cookie sessions via `@supabase/ssr`.

## Layers

| Layer | File | Role |
| --- | --- | --- |
| Proxy | `src/proxy.ts`, `src/lib/supabase/proxy.ts` | Refreshes the session cookie on every request. **Optimistic** redirects: signed-out → `/sign-in/child` for `/child`, `/login?next=…` (query kept) for other `protectedRoutePrefixes`; signed-in → `/dashboard` for auth pages. |
| DAL | `src/features/auth/server/session.ts` | `getCurrentUser()` verifies the JWT (`getClaims`) and returns a narrow `SessionUser`. `requireUser(path)` for pages (redirects to `/login?next=<path>`), `assertUser()` for actions/APIs (throws 401). Memoised per request. It calls `connection()` first: partial prefetching would otherwise prerender it, and auth-js reads `Date.now()` in `getClaims()`. |
| Roles DAL | `src/features/family/server/dal.ts` | `requireRole(role, path)` for pages, `assertRole(role)` / `assertParentOf(childId)` for actions. Role comes from the approved membership, else the server-set `profiles.role`. Memoised per request. |
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

**Identity.** A child is a real Supabase auth user, created only by the server with the admin client (`createChildAuthUser` in `src/features/family/server/child-auth.ts`): a synthetic, non-deliverable email `<uuid>@child.jarso.invalid`, a random password nobody knows, and `app_metadata.jarso_role = "child"`. `profiles.role` follows from app metadata only (never user metadata). GoTrue writes app metadata in an UPDATE after the insert, so a second trigger, `on_auth_user_app_metadata_updated`, applies the child role. Parents can't sign up with the child domain (`signUpSchema`). A parent adds the child with `register_child` (nickname, PIN, consent); a child-started invitation ends the same way when the parent accepts it at `/invite`.

**PIN sign-in.** `/sign-in/child` takes family code, nickname and PIN. `childSignInAction` → `childSignIn` (`src/features/family/server/service.ts`):

1. Rate limits, counted on every attempt: `pin:ip:<ip>` 20 per 15 min and `pin:family:<code>` 30 per hour (`getClientIp` reads the first `x-forwarded-for` hop).
2. `verify_child_pin` (admin client, service_role only) normalises the code (upper case, spaces and hyphens removed) and nickname (trimmed, case-insensitive) and returns `ok`, `invalid` or `locked`. It never raises, so the failure counter commits. Five wrong PINs in a row lock the child for 15 min, doubling per lock up to 24 h; a correct PIN is refused while locked.
3. Copy: `invalid` → "Hmm, that didn't match. Check with your parent." (same for unknown family or nickname); `locked` or a rate limit → "Too many tries. Ask your parent or wait a little while."

**Session minting.** On `ok`, `mintChildSession` calls admin `generateLink({ type: "magiclink", email })` and then `verifyOtp({ type: "magiclink", token_hash })` on the request's cookie client. The result is a normal Supabase cookie session for the child, so the proxy, DAL and RLS treat it like any other user. It needs writable cookies: Server Action or Route Handler only. No email is sent.

**Redirects.** Signed out, `/child` goes to `/sign-in/child` (proxy and `requireRole("child")`), never to the parent login. A child opening a parent page lands on `/child`; a parent opening `/child` lands on `/parent`. The e2e suite (`tests/e2e/onboarding.spec.ts`) covers all of these.

## Hosted setup

Done by hand in the Supabase dashboard; the repo can't apply it.

1. **Authentication → URL Configuration.** Site URL: `https://jarso.vercel.app`. Redirect URLs: `https://jarso.vercel.app/auth/callback**`, plus `http://localhost:3000/auth/callback**` for local dev against hosted. `/auth/confirm` needs no entry: the email builds it from the Site URL.
2. **Authentication → Email Templates → Confirm signup.** Subject `Confirm your Jarso account`, body:

```html
<h2>Confirm your email</h2>

<p>Tap the link below to confirm your email and finish setting up Jarso. You can open it on any device.</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo | urlquery }}">Confirm my email</a>
</p>
<p>If you didn't sign up for Jarso, you can ignore this email.</p>
```

Keep it identical to `supabase/templates/confirmation.html`. The link goes to the Site URL's host, so the Site URL must be the app's real origin.

## Adding OAuth providers

Enable in `supabase/config.toml` (`[auth.external.<provider>]`) and the dashboard, then call `supabase.auth.signInWithOAuth({ provider, options: { redirectTo: <APP_URL>/auth/callback } })` from a client component.
