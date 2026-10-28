---
name: production-readiness
description: Right-sized production engineering for Jarso, a Next.js 16 + Supabase app serving roughly 50–60 users. Covers 94 concepts (rate limiting, caching, queues, idempotency, locking, indexing, N+1, cron, SSE, feature flags, rollbacks, health checks, observability, SLOs, secrets, OAuth, CSRF/CORS/XSS/SSRF, backups, cold starts, serverless limits, tail latency, and more) and says for each whether to apply it now, apply a cheap version, or merely design so it can be added later. Use this skill whenever you design or review any backend behaviour — a Server Action, Route Handler, migration, cron job, Claude API call, deployment or CI change — and whenever the user mentions scale, performance, reliability, security hardening, "production-ready", "what if it fails", "what if two users…", or asks how a system-design concept applies here. Also use it to talk the user out of over-building (Redis, queues, Kubernetes, microservices) when a Postgres table or platform feature already does the job.
---

# Production readiness at Jarso's scale

Jarso will have 50–60 users: children aged 11–14 and perhaps their parents, in one region, with traffic peaks after school. The stack is one Next.js 16 app on a serverless host (Vercel-style), one hosted Supabase project (Postgres, Auth, Storage, Realtime, pg_cron) and the Claude API for the money guide. Project rules live in `CLAUDE.md`; this skill adds the operational judgement on top.

The point of knowing all 94 concepts below is not to implement them. It is to recognise which ones the platform already handles, which ones cost an hour and prevent a real incident, and which ones would be premature. A system for 60 users that is built like a system for 6 million is harder to change, costs more, and breaks in more places. A system for 60 users that ignores idempotency, backups or input validation breaks the first week. The skill is in telling the two apart.

## Three tiers

- **Do.** Cheap, prevents a realistic failure at this scale, or is irreversible to skip (data loss, security). Apply in the same PR.
- **Cheap version.** The full pattern is overkill, but a Postgres table, a platform toggle or a 20-line helper gets 90% of the value. Apply when the feature that needs it lands.
- **Know.** Understand it, design so it can be added later (stateless app, one source of truth, append-only money ledger), but do not build it. Mention it in a PR only if the change makes it harder to add later.

When a tier says "Know", the right output is often one sentence in the PR description, not code.

## How to use this skill

1. Identify what kind of change you are making and run the matching checklist below.
2. Apply every **Do** item. For **Cheap** items, apply them if the feature touches that concern. For **Know** items, keep the design open and move on.
3. If a concept is unfamiliar in context, read its entry in the matching `references/<category>.md`. Each entry says what it is, how it maps to this stack, and the concrete move.
4. In the PR description, add a short "Scale notes" line when you deliberately deferred something, so the next person knows it was a choice.

## Checklists by kind of change

**Server Action or Route Handler**
- Zod validation and `assertUser()` (already required by `CLAUDE.md`).
- Idempotency for writes that create money entries: client-generated id with a unique constraint, or an upsert. Double-clicks and retried requests are the realistic failure here.
- Timeouts on every outbound call. Nothing waits forever on a serverless function.
- Return `RATE_LIMITED` (the `AppError` code already exists) for anything expensive, especially Claude calls.
- Cookie-authenticated Route Handlers that mutate: check the `Origin` header matches the app URL. Server Actions get this check from Next.js; Route Handlers do not. Never add a wildcard CORS header to a cookie-authenticated route.
- Never put per-user data in a shared cache (`use cache` without a user key). Request-time data stays request-time.
- Log with context (`logger` from `@/lib`), never the user's row or tokens.

**Schema or migration**
- Index every foreign key and every column in an RLS predicate (`docs/database.md` rule 5). A ledger table wants `(user_id, created_at desc)`.
- Expand/contract: add the new column or table first, ship code, then remove the old one in a later deploy. Destructive changes never ship with the code that stops using the old shape.
- Constraints encode invariants: `check (amount_minor >= 0)`, a partial unique index for "one active goal", a `mode` column so practice and recorded money cannot be summed by accident.
- Any row a child can edit from two devices gets `updated_at` compared on write (optimistic locking). The ledger itself is append-only, so most races disappear by design.
- Multi-row money writes (allocate an allowance into Spend and Save) happen in one Postgres function called via `rpc`, so they are one transaction.
- Confirm backups exist on the Supabase plan before the first destructive migration.

**Anything that calls the Claude API (the guide, FR07–FR09)**
- Timeout (30 s is generous for a child's question) and bounded retries with backoff. The Anthropic SDK has `timeout` and `maxRetries`; set them explicitly.
- Per-user limits: requests per minute and tokens per day, stored in a Postgres table. This is the cost cap and the abuse cap in one.
- Stream the answer (Server-Sent Events from a Route Handler, or a streaming Server Action) so time-to-first-token is what the child feels, not total latency.
- A friendly fallback when the API is down or the budget is spent. Do not retry a failing provider in a loop; after a few consecutive failures within a minute, fail fast for that minute. That is a circuit breaker and it is ten lines.
- Log model, token counts and latency per call. Cost per child per day is the metric that matters.
- Treat lesson content and user messages as untrusted when building prompts; FR09 boundaries live in the system prompt and in output checks, not in hope.

**Scheduled work (weekly review FR11, spaced review FR06, resume prompts FR12)**
- Use `pg_cron` inside Supabase or the host's cron hitting a route guarded by a `CRON_SECRET`. No separate worker.
- Make every job idempotent on a natural key such as `(user_id, week_start)`. Cron will run twice one day.
- Track runs in a `jobs` or `review_runs` table with `status`, `attempts`, `last_error`. Rows stuck in `failed` are the dead-letter queue. Process users in chunks so one slow user does not time out the function; that is backpressure.

**Money writes (allocations, transfers, diary entries, corrections)**
- Append-only ledger with an explicit `kind`. Corrections are new rows that reverse old ones. This gives auditability, undo (FR04) and freedom from most locking.
- One transaction per user action. Use a Postgres function for anything touching more than one row.
- Integer minor units only. Derive balances by summing, or maintain a balance column updated in the same transaction and verified by a periodic reconciliation query.
- Reason explicitly about two concurrent requests for the same child before merging. Usually the unique constraint or the transaction already answers it; write the answer in the PR.

**Deploy, release, CI**
- Preview deployment per PR, then promote. Rollback is "redeploy the previous build" and must take under a minute. Know how to do it before you need it.
- Migrations run in CI against the hosted project (staging first if one exists), not from a laptop.
- Big features (the guide, missions) ship behind a flag: an env var or a `feature_flags` table checked server-side. Remove the flag once the feature is stable.
- After every deploy, hit `/api/health` and a signed-in page. Keep an external uptime monitor pointed at the health route.

**Adding a third-party service or dependency**
- Write down: what happens when it is down, how long we wait, where its secret lives, what it costs at 60 users and at 6,000. If any answer is "don't know", find out first.

## The 94 concepts, triaged

Read the matching reference file when you need the how-to. The one-liners here are the decision; the reference has the mechanics.

### APIs, networking and resilience → `references/apis-and-resilience.md`

| Concept | Tier | At Jarso's scale |
| --- | --- | --- |
| Rate limiting | Cheap | Supabase Auth already limits sign-in/up. Add a Postgres counter per user for Claude calls and any expensive route; return 429. |
| Caching | Do | `use cache` for public/static content and lesson material; never for per-user data without a user key. `updateTag`/`refresh` after writes. |
| Load balancing | Know | The host does it. Keep the app stateless so it keeps working. |
| Reverse proxies | Know | The host terminates TLS and routes. `src/proxy.ts` is our only proxy-like layer and it only touches auth. |
| API gateways | Know | Supabase's gateway fronts PostgREST/Auth. We do not add one. |
| Service discovery | Know | One service. URLs come from env vars. |
| Circuit breakers | Cheap | For the Claude API only: after N failures in a window, fail fast with fallback copy for a minute. |
| Timeouts | Do | Every outbound call gets one. Functions have hard limits; set `maxDuration` where streaming needs longer. |
| Retries | Do | Only on idempotent calls, bounded, with backoff. Never retry a money write without an idempotency key. |
| Exponential backoff | Do | SDK default for Claude. For cron jobs, back off between attempts via `attempts` and `next_run_at`. |
| Idempotency | Do | Client-generated ids plus unique constraints on money entries. Cron keyed by natural key. Webhooks keyed by event id. |

### Messaging and event-driven systems → `references/messaging-and-events.md`

| Concept | Tier | At Jarso's scale |
| --- | --- | --- |
| Message queues | Cheap | A `jobs` table in Postgres, or Supabase Queues (pgmq), if work must outlive the request. No broker. |
| Pub/Sub | Know | Supabase Realtime or Database Webhooks if ever needed. Not for v1. |
| Event-driven architecture | Cheap | Postgres triggers (like `handle_new_user`) and `after()` from `next/server` for post-response work. Keep it to a handful. |
| Distributed transactions | Know | Avoid by keeping all state in one Postgres. The Claude call + DB write pair uses write-pending, call, then update. |
| Saga pattern | Know | Not needed while there is one database. A single transaction replaces it. |
| Dead letter queues | Cheap | `status = 'failed'` plus `last_error` on the jobs table, with a query you actually look at. |
| Cron jobs | Do | `pg_cron` or host cron with a secret. Idempotent, logged, chunked. |
| WebSockets | Know | Serverless cannot hold them. Supabase Realtime if live updates are ever needed. |
| Long polling | Know | Only as a fallback where SSE is unavailable. Not planned. |
| Server-Sent Events | Do | How the guide streams answers. A `ReadableStream` response from a Route Handler. |

### Databases and distributed systems → `references/databases.md`

| Concept | Tier | At Jarso's scale |
| --- | --- | --- |
| Database indexing | Do | FKs, RLS predicate columns, and the ledger's `(user_id, created_at desc)`. Check `explain analyze` once per new query shape. |
| Query optimization | Cheap | Select only needed columns, filter in SQL not JS, use Supabase's Query Performance page when something feels slow. |
| N+1 queries | Do | One query with embedded relations or an `in` filter per page render. Watch loops that call a service per item. |
| Connection pooling | Know | supabase-js speaks HTTP to PostgREST, so pooling is Supabase's problem. If direct Postgres is ever added, use the pooler port in transaction mode. |
| Read replicas | Know | Available on Supabase if reads ever dominate. Not at 60 users. |
| Sharding | Know | Never for this product. Partition by `user_id` only on paper. |
| Partitioning | Know | A ledger with years of rows for 60 children is still small. Revisit past tens of millions of rows. |
| Replication | Know | Supabase handles it. Understand it exists so failover makes sense. |
| Leader election | Know | Only matters with multiple workers. Cron via `pg_cron` runs once by construction. |
| CAP theorem | Know | One Postgres gives consistency. The only "eventual" parts are Next caches and Realtime; design UI to tolerate a stale read for seconds. |
| Eventual consistency | Cheap | After a write, `refresh()`/`updateTag` so the child sees their own change immediately. |
| Optimistic locking | Cheap | `updated_at` check on editable rows (profile, goal, diary entry). |
| Pessimistic locking | Know | `select … for update` inside a Postgres function if a balance column is maintained. Rare. |
| Distributed locks | Know | `pg_advisory_xact_lock(hash(user_id))` inside a function if a per-user job must not overlap. No Redis. |
| Race conditions | Do | Reason about two concurrent requests per write path. Constraints and single transactions answer most cases. |
| Deadlocks | Cheap | Short transactions, consistent table ordering inside functions, and Postgres detects the rest. |

### Memory, concurrency and scaling → `references/memory-concurrency-scaling.md`

| Concept | Tier | At Jarso's scale |
| --- | --- | --- |
| Memory leaks | Cheap | Module-level Maps and listeners survive across requests on a warm function. Clean up `useEffect`s. Stream large responses. |
| Garbage collection | Know | Node handles it. Avoid building huge arrays from unbounded queries; paginate. |
| Thread safety | Cheap | Node is single-threaded but requests interleave. Never store per-request data in module scope; React `cache()` is per request. |
| Backpressure | Cheap | Stream Claude output; chunk cron work; paginate lists. |
| Autoscaling | Know | Serverless scales the app. Supabase compute size is the knob for the database. |
| Horizontal scaling | Know | Already possible because the app is stateless. Keep it so: no in-memory sessions or counters that matter. |
| Vertical scaling | Know | Bump the Supabase compute tier before any architectural change. |
| CDN | Do | Static assets are on the host's CDN automatically. Put lesson images in Supabase Storage with public cache headers. |
| Edge caching | Do | Per-user pages must stay uncached; the proxy already forwards `cache-control` from Supabase. Public pages can cache. |
| Cache invalidation | Do | Tag caches (`cacheTag`) and invalidate on write (`updateTag`). Prefer short `cacheLife` over clever invalidation. |

### DevOps, containers and deployment → `references/devops-and-deployment.md`

| Concept | Tier | At Jarso's scale |
| --- | --- | --- |
| CI/CD | Do | Exists (`ci.yml`). Add deploy previews and run migrations from CI. |
| Docker | Know | Only for local Supabase. Do not containerise the app unless leaving the serverless host. |
| Kubernetes | Know | No. Understand pods/probes so the vocabulary maps to platform features. |
| Feature flags | Cheap | Env var or `feature_flags` table, read server-side. Delete flags after launch. |
| Blue-green deployment | Know | Immutable deploys plus instant promote/rollback on the host give the same guarantee. |
| Canary releases | Know | At 60 users a canary is 1 user. Use a feature flag for a few test accounts instead. |
| Rolling deployments | Know | Platform behaviour. Our job is backward-compatible migrations so old and new code coexist for a minute. |
| Rollbacks | Do | Know the host's rollback button; keep migrations expand/contract so code can roll back without the schema. |
| Health checks | Do | `/api/health` exists. Add a deep variant that runs a trivial Supabase query, for the uptime monitor. |
| Liveness and readiness probes | Know | Kubernetes terms for the two health checks above. Shallow = liveness, deep = readiness. |

### Monitoring and observability → `references/observability.md`

| Concept | Tier | At Jarso's scale |
| --- | --- | --- |
| Monitoring | Do | External uptime check on the health route plus the host and Supabase dashboards. |
| Logging | Do | Structured `logger` exists. Add a request id and the user id (never email) to server logs. |
| Distributed tracing | Know | One service; a request id in logs is the trace. OpenTelemetry via `instrumentation.ts` only if a second service appears. |
| Metrics | Cheap | Count the things that matter: sign-ups, missions completed, guide calls, tokens, errors. A daily SQL query beats a dashboard product. |
| Alerts | Do | Uptime down, error-rate spike (Sentry or host), Claude spend over budget. Three alerts, to a place someone reads. |
| SLOs | Cheap | Two informal ones: 99.5% availability, p95 dashboard load under 2 s. Write them in `docs/`. |
| SLIs | Cheap | Health-check success rate and p95 from the host's analytics. Nothing custom. |
| Error budgets | Know | If availability drops below the SLO for a month, spend the next sprint on stability instead of features. That is the whole policy. |
| Observability | Cheap | Error tracker (Sentry free tier) with source maps, client and server. Logs plus errors plus the two SLIs is enough to debug anything at this size. |

### Security and authentication → `references/security.md`

| Concept | Tier | At Jarso's scale |
| --- | --- | --- |
| Secrets management | Do | Host env vars only. `SUPABASE_SECRET_KEY` never gets a `NEXT_PUBLIC_` prefix, never lands in logs, prompts or `.claude-logs/`. Rotate on any doubt. |
| IAM | Do | Supabase roles (`anon`, `authenticated`, `service_role`) plus RLS are the IAM. Least privilege on GitHub and host teams. |
| OAuth | Cheap | `signInWithOAuth` through the existing PKCE callback when a provider is wanted. Parent sign-in is the likely case. |
| JWT rotation | Know | Supabase rotates access tokens via refresh tokens; `getClaims` verifies against published keys. Rotate signing keys from the dashboard if leaked. |
| TLS | Know | Host and Supabase enforce HTTPS. HSTS header is already set. Never call Supabase over `http://` outside local dev. |
| Encryption at rest | Know | Supabase disks are encrypted. Column-level encryption (Vault) only if truly sensitive fields appear; none planned. |
| Encryption in transit | Know | TLS everywhere, including Postgres connections from CI. |
| WAF | Know | Host or Cloudflare offers one; turn it on if abuse appears. Do not write one. |
| DDoS protection | Know | Platform-level. Our contribution is rate limits so one script cannot run up the Claude bill. |
| CORS | Do | Route Handlers are same-origin by default. Do not add permissive CORS to cookie-authenticated routes. |
| CSRF | Do | Server Actions are protected by Next.js origin checks. Cookie-authenticated Route Handlers that mutate must check `Origin`. Supabase cookies are `SameSite=Lax`. |
| SQL injection | Do | PostgREST parameterises. Never build filter strings from input; in plpgsql use parameters or `format('%I'/'%L')`. |
| XSS | Do | React escapes by default. Render guide output as text or sanitised Markdown, never raw HTML. Add CSP when third-party scripts arrive. |
| SSRF | Cheap | Nothing fetches user-supplied URLs today. If it ever does (avatar import, link previews), allowlist hosts and block private ranges. `avatar_url` is stored, not fetched. |

### Database operations, disaster recovery and performance → `references/operations-dr-performance.md`

| Concept | Tier | At Jarso's scale |
| --- | --- | --- |
| Database migrations | Do | Exists. Forward-only, timestamped, applied by CI, expand/contract. |
| Schema versioning | Do | The migrations folder is the version. Regenerate and commit `database.types.ts` with every change. |
| Disaster recovery | Cheap | Write a one-page runbook: where backups are, how to restore, who has access, expected RPO/RTO. Test a restore once. |
| Backups | Do | Supabase Pro daily backups at minimum; PITR if a day of lost diary entries is unacceptable. Free tier has no backups. |
| Failover | Know | Supabase handles database failover. Our side is retries on transient errors and a status page link in the error boundary. |
| Multi-region deployment | Know | One region. Co-locate the host's function region with the Supabase region; that one choice is worth more than any multi-region plan. |
| Chaos engineering | Cheap | Once per release: run locally with Supabase stopped and with a bogus Claude key, and check the child sees a kind message, not a stack trace. |
| Cost optimization | Do | Fixed: Supabase Pro, host plan. Variable: Claude tokens. Cap tokens per child per day, cache answers to common topic questions, set billing alerts. |
| Cold starts | Cheap | Keep Route Handlers' imports light (no SDKs in the proxy), avoid giant dependencies, and use a paid Supabase tier so the database never pauses. |
| Serverless limits | Do | Function duration, body size, no persistent disk, no long-lived sockets. Streaming and `after()` work within them; design around them rather than against them. |
| Latency | Do | Region co-location, `<Suspense>` boundaries, streaming. Measure with the host's speed insights, not guesses. |
| Throughput | Know | Trivial at 60 users. Never trade simplicity for throughput here. |
| P99 latency | Cheap | Watch it for the guide route only; streaming makes the perceived p99 small. |
| Tail latency | Know | Caused by cold starts and slow Claude calls. Timeouts and fallbacks bound it; nothing else is needed. |

## Escalation triggers

Revisit the tiers when any of these happen. Until then, the answers above stand.

- More than roughly 1,000 daily active users, or a school rollout is planned.
- Database over about 10 GB, or any query over 500 ms in the Query Performance page.
- p95 dashboard load over 1 s from the target region.
- Claude spend over the monthly budget two months running.
- Users in a second continent.
- A second deployable (mobile backend, separate worker) or a team of more than five engineers.

## Anti-patterns to push back on

- Redis for rate limits, sessions or locks when Postgres already holds the data.
- A message broker, worker fleet or saga orchestration while one database holds all state.
- Microservices, Kubernetes or a custom API gateway for one app.
- Hand-rolled auth, JWT handling or crypto when Supabase Auth exists.
- Caching per-user data in a shared cache "for speed". That is a session leak.
- Sharding, partitioning or read replicas before a measured problem.
- Skipping backups, idempotency or input validation because "it's only 60 users". Those are the ones that cost real data.
