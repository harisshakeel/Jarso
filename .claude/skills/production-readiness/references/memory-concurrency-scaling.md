# Memory, concurrency and scaling

The app runs as short-lived serverless functions that may be reused ("warm") across many requests. Most problems in this file come from forgetting that module scope is shared across requests on a warm instance and that nothing in memory survives a cold start.

## Memory leaks — Cheap

Memory that is never released. Server side: a module-level `Map` used as a cache without eviction grows until the instance is recycled; event listeners added per request and never removed do the same. Client side: `useEffect` without cleanup, subscriptions (Realtime channels) never unsubscribed. Moves: bound any module-level cache (size and age), unsubscribe in cleanups, stream rather than buffer large responses.

## Garbage collection — Know

The runtime reclaims unused memory automatically. It is not a concern at this scale except indirectly: building a large array from an unbounded query causes allocation spikes and slow requests. Paginate and aggregate in SQL.

## Thread safety — Cheap

Code behaves correctly when run concurrently. Node runs JavaScript on one thread, but `await` points let requests interleave, so a module-level variable mutated during a request can be observed by another. Rules: never put per-request data (user id, supabase client) in module scope; React's `cache()` (used by `getCurrentUser`) is per request by design; create the Supabase server client per request (already done).

## Backpressure — Cheap

A slow consumer signals a fast producer to slow down, instead of buffering until memory runs out. Where it shows up here: streaming Claude output to the browser (pipe the stream, do not accumulate), cron jobs over all users (process in chunks and reschedule), and list screens (paginate). If a job must call Claude for each child, do a bounded number per invocation.

## Autoscaling — Know

Capacity grows and shrinks with load automatically. The host does this for the app. The database does not autoscale; its compute tier is a manual choice and the realistic bottleneck long before the app is.

## Horizontal scaling — Know

More instances. Already possible because the app keeps no state between requests. Preserve this: sessions in cookies, state in Postgres, files in Supabase Storage, no local disk.

## Vertical scaling — Know

A bigger instance. For us this means the Supabase compute add-on. It is the first lever to pull when the database is slow, well before caching layers or replicas.

## CDN — Do

Servers near users that serve static files. The host puts `_next/static` and public assets on its CDN automatically. Lesson images and audio belong in Supabase Storage (public bucket, long `cache-control`), which also sits behind a CDN. Do not serve media from the Next.js function.

## Edge caching — Do

Caching whole responses at the CDN edge. Safe for public pages and static assets; dangerous for anything per user, because a cached response with one child's data would be served to another. The Supabase proxy helper already forwards `cache-control: no-store` style headers when it sets session cookies; keep that path intact and never add public cache headers to routes that read cookies.

## Cache invalidation — Do

Making caches forget stale data. In Next.js 16: tag cached functions with `cacheTag("lessons")`, then call `updateTag("lessons")` in the Server Action that edits lessons. For per-user screens, `refresh()` after a mutation (already the pattern). Prefer short `cacheLife` profiles so a missed invalidation heals itself in minutes rather than becoming a support ticket.
