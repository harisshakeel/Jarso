# 0016. Mobile reads and writes through Supabase directly; /api/v1 only for server secrets

- Status: Accepted. Supersedes the twin-route part of 0015.
- Date: 2026-11-02

## Context

ADR 0015 left open whether the mobile app reads and writes through `/api/v1` routes or through Supabase with RLS. Taking the first road meant about 50 actions plus every read as twin routes, each one a new surface to authorise and keep in step with the Server Actions. But the money rules already live in Postgres: every wave 1 mutation is a `security definer` function that checks `auth.uid()` through `is_self` or `is_parent_of`, and RLS guards the reads. A phone is not trusted either way.

## Decision

- **Direct Supabase with RLS** for every read and write the phone makes, through the shared repository layer `@jarso/data` (`requests`, `diary`, `family`, `ledger`, `rules`). The web's repositories re-export it, so both apps run the same queries.
- **`/api/v1` only where a server secret is needed:** `POST /api/v1/auth/child-sign-in` (admin client mints the session) and `POST /api/v1/notices/dispatch` (service key sends web push). Later waves add routes only on the same test.
- **Bearer auth** for those routes through `assertRequestUser` (`getClaims` on a stateless client, no cookie fallback when a header is present).
- **No money rule only in TypeScript.** If a rule is missing in Postgres, it is added there, not in the app.
- **One child, two devices.** PIN sign-in stops rotating the child's password, which ended other sessions. A database trigger (`on_auth_child_password_changed`) scrambles any child password instead, so no child password is ever usable.

## Consequences

- Wave 1 needs two routes, not fifty. Web behaviour does not change; web services keep their auth check and call the shared code.
- `@jarso/data` takes a Supabase client as a parameter and follows core's purity rules (no React, Next, `server-only`, `@supabase/ssr`, `idb`).
- The phone ships only public values (Supabase URL, publishable key, API URL). A missed RLS policy is now directly exposed to the phone, so new tables and functions get the same pgTAP scrutiny as before.
- The password-guard migration must be pushed to the hosted database before or with the web deploy.
- The PIN rate limits trust the first `x-forwarded-for` hop, which holds on Vercel only.
- Push after a mobile action is a fire-and-forget call; if missed, the 15-minute `/api/cron/push` sweep (pg_cron `push-sweep`, mobile wave 3) delivers it.
