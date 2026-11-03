# 0017. Request-scoped bearer auth for the phone's `/api/v1` routes

- Status: Accepted. Extends 0016.
- Date: 2026-11-03

## Context

ADR 0016 gave the phone two routes that took a bearer token through `assertRequestUser`, which returns only the user's id. Wave 2 adds routes whose handlers call existing services (outbox, guide turns, mission start). Those services call `getCurrentUser()` and `createClient()`, which read cookies. Rewriting every service to take a user and a client would touch the web's code paths, and a missed spot would silently fall back to cookies.

## Decision

- **A request scope.** `verifyBearer()` (`apps/web/src/lib/supabase/request-scope.ts`) runs `getClaims(jwt)` on a stateless client and accepts only a signed-in user's access token: `sub` a UUID, `role` `authenticated`, `aud` `authenticated`, not anonymous. Inside an `AsyncLocalStorage` scope, `getCurrentUser()` returns that user and `createClient()` returns a client acting as them (`accessToken` option, so RLS applies; any `client.auth.*` call throws). Services and DAL helpers run unchanged.
- **Routes opt in** with `withApi(handler, { bearer: true })`. A route without it ignores the header and uses cookies, as before.
- **No fallback.** With an `Authorization` header present, cookies are never read; a bad token is `UNAUTHORIZED` (a slow verify is `UNAVAILABLE`), never a cookie session. The token is never logged.
- `assertRequestUser` stays for handlers that need only the user's id.

## Consequences

- Web services are shared with the phone without changes, so a rule lives in one place.
- Concurrent bearer and cookie requests cannot see each other's user: the scope is per request (covered by a test).
- Work started inside a scope (a guide turn's stream, `after()` callbacks) inherits it; code that escapes it, such as a detached timer, would fall back to cookies and must not be added.
- Each new bearer route must be opted in deliberately; forgetting it makes the phone's calls fail as signed out, which is the safe direction.
- `getClaims` checks the signature and expiry, not revocation: an access token stays valid until it expires (about an hour) even after the child signs out. Accepted for a pocket-money app; the refresh token is revoked on sign-out.
