# Database operations, disaster recovery and performance

What keeps the data safe and the app quick. The single most valuable decisions here are: a paid Supabase tier with backups, the host's function region matching the Supabase region, and a tested restore.

## Database migrations — Do

Versioned, ordered SQL that moves the schema forward. Already in place under `supabase/migrations/` with rules in `docs/database.md`. Apply from CI, never edit an applied migration, expand before contract, regenerate types after each one.

## Schema versioning — Do

Knowing which schema a database has. Supabase records applied migrations in `supabase_migrations.schema_migrations`; `supabase migration list --linked` shows local versus remote. The generated `database.types.ts` is the code's view of the schema and must be committed with the migration that changed it so types and tables never drift.

## Disaster recovery — Cheap

Getting back to a working system after loss. Write `docs/operations.md` with: where backups live, how to restore (Supabase dashboard or `supabase db dump` plus `psql`), who has access, the expected recovery point (how much data can be lost) and recovery time. Test a restore into a fresh project once; an untested backup is a hope.

## Backups — Do

Copies of the data from the past. Supabase's free tier has no backups. Pro includes daily backups retained for a week; Point-in-Time Recovery is an add-on that lets you restore to any second. Decide the recovery point: for a child's money diary, losing a day is painful but survivable, so daily is the floor and PITR is the comfortable choice. As a belt-and-braces measure, a weekly `supabase db dump` from CI into private object storage costs nothing.

## Failover — Know

Switching to a standby when the primary fails. Supabase runs it for the database. Our side: transient-error retries on reads, an error boundary that says something kind, and a status link. Do not build a failover of our own.

## Multi-region deployment — Know

Running in several regions for latency or resilience. Not for one region of users. The decision that matters now is co-location: choose the Supabase region closest to the users, then pin the host's function region to the same place; cross-region database calls add tens of milliseconds to every query and dominate page latency.

## Chaos engineering — Cheap

Deliberately breaking things to see what happens. The 60-user version: before each release, run locally with Supabase stopped, then with an invalid Claude key, then with the network throttled, and check the child sees a friendly message and nothing leaks. Fifteen minutes, and it exercises every error path the error boundaries claim to handle.

## Cost optimization — Do

Spending in proportion to value. Fixed costs are the Supabase and host plans. The variable cost is Claude tokens, which a single enthusiastic child or a bug in a retry loop can inflate. Moves: a per-child daily token budget enforced in the database, a shorter and cheaper model for classification and hints with the stronger model for explanations, cached answers for common topic questions, provider billing alerts, and a monthly glance at the two dashboards.

## Cold starts — Cheap

The latency of a function instance starting from nothing. Keep Route Handlers' import graphs small (import the Anthropic SDK only in the guide route, never in `proxy.ts`), avoid heavy dependencies for small jobs, and keep the Supabase project on a tier that never pauses (free-tier projects pause after inactivity, and the first request then takes seconds). Streaming hides the rest.

## Serverless limits — Do

Constraints of the function model: maximum duration (configure `maxDuration` per route within the plan's ceiling), request body size limits, no persistent filesystem, no long-lived sockets, limited memory. Design with them: stream long responses, do post-response work with `after()`, store files in Supabase Storage, split long jobs into chunks. Check the host's current limits before promising a feature that pushes them.

## Latency — Do

How long a request takes. Levers in order of payoff: region co-location, `<Suspense>` boundaries so static shells paint before data arrives, few queries per page, indexes, streaming for the guide. Measure with the host's speed insights from the users' region before optimising.

## Throughput — Know

Requests per second the system can handle. Sixty users cannot generate a load that matters to serverless functions or a small Postgres. Never trade clarity for throughput here; the code should optimise for being understood by the next engineer.

## P99 latency — Cheap

The time within which 99% of requests complete; the slow tail users remember. Track it for the guide route only, where Claude's variance lives. Streaming converts a slow p99 into a fast first token, which is what the child perceives.

## Tail latency — Know

The far end of the latency distribution, caused here by cold starts, slow provider responses and occasional lock waits. Timeouts, fallbacks and co-location bound it. There is nothing else to build at this scale.
