# APIs, networking and resilience

Each entry: what the concept is, how it maps to Next.js 16 + Supabase on a serverless host, and the concrete move at Jarso's scale (50–60 users). Tiers are defined in `../SKILL.md`.

## Rate limiting — Cheap

Bounding how often a caller may do something, to protect cost and availability. Supabase Auth already limits sign-in, sign-up and email sends per IP (see `supabase/config.toml` `[auth.rate_limit]` for the local values; the hosted project has its own). The host may offer per-route limits too.

Our move: a `usage_limits` table keyed by `(user_id, bucket, window_start)` with a counter, incremented inside the same Postgres function that records the action. Check it before calling Claude and before any route that costs money or sends email. Throw `AppError("RATE_LIMITED", …)`; `withApi` and `createAction` already map it to 429. Limits for the guide: a handful of requests per minute and a daily token budget per child. Do not reach for Redis or an external limiter; the counter lives next to the data it protects.

## Caching — Do

Reusing a computed result instead of recomputing it. With `cacheComponents` on, Next.js 16 lets you mark a function or component with `"use cache"`, give it a `cacheLife` profile and `cacheTag`s, and invalidate with `updateTag` (immediate, from a Server Action) or `revalidateTag`.

Our move: cache public and shared content only: marketing pages, lesson material, topic cards. Anything derived from cookies or the user's rows stays request-time inside `<Suspense>`. If per-user caching is ever worth it, the user id must be part of the cache key and the tag. After a mutation, `refresh()` (already used) or `updateTag`. Prefer a short `cacheLife` over elaborate invalidation.

## Load balancing — Know

Spreading requests across instances. The serverless host does this per request. The only requirement on us is statelessness: no in-memory sessions, no per-instance counters that matter, no local files. The current code honours this (cookie sessions, Postgres state).

## Reverse proxies — Know

A server in front of the app that terminates TLS, compresses, routes and adds headers. The host is the reverse proxy. `src/proxy.ts` is Next.js 16's request-time hook and we use it only for session refresh and optimistic redirects; keep it fast and free of heavy imports because it runs on every request.

## API gateways — Know

A single entry point that handles auth, rate limits and routing for many services. Supabase's gateway fronts PostgREST, Auth, Storage and Realtime. Our `/api/v1` routes are the only public surface and `withApi` is their shared envelope. No gateway product.

## Service discovery — Know

How services find each other's addresses. We have one service plus Supabase, located by `NEXT_PUBLIC_SUPABASE_URL`. If a second service ever appears, an env var is still the right answer.

## Circuit breakers — Cheap

Stop calling a failing dependency for a while so you fail fast and let it recover. Only the Claude API qualifies. A module-level counter of consecutive failures with a timestamp is enough on a warm function: after, say, three failures in sixty seconds, return the fallback immediately for the next sixty seconds. Because serverless instances are many, this is per instance and approximate; that is fine, the aim is not to hammer a provider that is already down and not to make a child wait 30 s to learn that.

## Timeouts — Do

Every outbound call has a maximum wait. Supabase calls are fast and local to the region, but still wrap long ones with `AbortSignal.timeout`. Claude calls get an explicit `timeout` in the SDK client options (30 s for a chat answer; less for a classification). Route Handlers that stream set `export const maxDuration` to what the host allows. A function that hits the platform limit dies without running your error handling, so your timeout must be shorter than the platform's.

## Retries — Do

Repeat a failed call. Safe only when the call is idempotent. Reads: retry once or twice. Claude calls: the SDK's `maxRetries` (default 2) with backoff is right; set it explicitly so it is visible. Money writes: never retry blindly; retry only with the same idempotency key so the second attempt is a no-op.

## Exponential backoff — Do

Wait longer between each retry (1 s, 2 s, 4 s, with jitter) so a struggling dependency is not flooded. The Anthropic SDK does this. For cron jobs, store `attempts` and `next_run_at = now() + (2 ^ attempts) * interval '1 minute'` and let the next run pick the row up. Cap attempts; after that the row is dead-lettered.

## Idempotency — Do

Doing the same request twice has the same effect as once. The realistic duplicates here are double-clicked forms, browser retries and cron running twice.

Our move:
- Money entries: the client generates a UUID per intended entry and sends it; the table has a unique constraint on it; the insert uses `on conflict do nothing` and returns the existing row. The `pending` state on the button is UX, not protection.
- Allocation of an allowance: keyed by `(user_id, allowance_period)` so marking it received twice does not double the income.
- Cron: keyed by `(user_id, week_start)`.
- Incoming webhooks (if any): store the provider's event id with a unique constraint before processing.
