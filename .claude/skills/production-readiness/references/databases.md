# Databases and distributed systems

One hosted Postgres with RLS is the whole data tier. Most "distributed" concepts here are about knowing what Supabase does for us and designing so a future upgrade is a tier change, not a rewrite.

## Database indexing — Do

Indexes make lookups cheap at the cost of slower writes and disk. Every foreign key and every column used in an RLS predicate gets one (`docs/database.md` rule 5); without it, RLS turns each query into a sequential scan filtered by `auth.uid()`. The ledger wants a composite `(user_id, created_at desc)` because every screen reads "this child's recent entries". Partial indexes encode rules: `create unique index … on goals (user_id) where status = 'active'` is "one active goal" (FR scope). After a new query shape, run `explain analyze` in Studio once; at this scale anything over a few milliseconds is a missing index, not a capacity problem.

## Query optimization — Cheap

Make queries do less work. Select the columns you need, filter and aggregate in SQL rather than in JavaScript, and paginate. Supabase's Query Performance page surfaces slow statements from `pg_stat_statements`; look at it when something feels slow, not weekly. Balances: either sum the ledger (fine for thousands of rows per child) or maintain a balance column in the same transaction and reconcile nightly. Pick one and document it.

## N+1 queries — Do

Fetching a list, then one query per item. Easy to cause here by calling a service inside a loop or rendering a component per row that fetches. Fix with PostgREST embedded selects (`select('*, diary_entries(*)')`), an `in('id', ids)` filter, or a SQL view. Rule of thumb: one page render, a handful of queries, independent of list length.

## Connection pooling — Know

Reusing database connections because opening one is expensive and Postgres has a hard cap. supabase-js talks HTTP to PostgREST, which pools for us, so serverless concurrency does not exhaust connections. If direct Postgres access is ever added (Drizzle, a script), connect through Supabase's pooler port in transaction mode and keep connections per function to one.

## Read replicas — Know

Copies of the database that serve reads. Supabase offers them on higher tiers. At 60 users the primary is idle; revisit when read latency is measured, not imagined.

## Sharding — Know

Splitting data across databases by key. Not for this product at any plausible scale. The natural shard key would be `user_id`, and every table already carries it, so the door is open on paper.

## Partitioning — Know

Splitting one table into pieces inside one database, usually by time. The ledger is the candidate, by month, after tens of millions of rows. Sixty children generating ten entries a day produce about 220,000 rows a year; no action needed.

## Replication — Know

Copying data to standbys for durability and failover. Supabase runs it. The concept matters when reading about PITR and failover: backups and replicas are different safety nets (replicas copy mistakes instantly; backups let you go back before them).

## Leader election — Know

Deciding which of several identical workers is in charge, so a job runs once. We avoid the need: `pg_cron` runs once by construction, and host cron hits one invocation. If two invocations could overlap, `for update skip locked` on the jobs table or `pg_advisory_xact_lock` gives the same guarantee without a coordinator.

## CAP theorem — Know

Under a network partition a distributed store must choose consistency or availability. One Postgres chooses consistency; a failover may cost seconds of availability. The parts of our system that are eventually consistent are Next.js caches and Realtime fan-out. Design UI so a few seconds of staleness in shared views is acceptable, and refresh the user's own view immediately after their own write.

## Eventual consistency — Cheap

Reads may lag writes briefly. Where we create it (cached content, `after()` work, cron-derived summaries), make the UI honest: show "updating" states, refresh after the user's own mutations with `refresh()` or `updateTag`, and compute money balances from the source ledger rather than a cached aggregate when correctness matters (the goal progress screen, FR02).

## Optimistic locking — Cheap

Detect concurrent edits by checking a version on write instead of locking on read. On rows a child edits (goal, profile, diary entry correction), send the `updated_at` you displayed and `update … where id = ? and updated_at = ?`; zero rows affected means someone else changed it, so throw `AppError("CONFLICT", …)` and reload. Cheap, and it prevents a tablet and a phone silently overwriting each other.

## Pessimistic locking — Know

Lock the row before reading so nobody else can write. Only inside a Postgres function, with `select … for update`, and only if we maintain a balance column that several writes race for. The append-only ledger avoids the need in most paths.

## Distributed locks — Know

A lock that spans processes, usually in Redis or ZooKeeper. In Postgres, `pg_advisory_xact_lock(hashtext(user_id::text))` inside a function serialises all work for one child for the duration of the transaction. That covers "generate this child's weekly review exactly once" without new infrastructure.

## Race conditions — Do

Two operations interleave and produce a result neither intended. Before merging any write path, write one sentence answering "what if this runs twice at the same moment for the same child?". Acceptable answers: a unique constraint rejects the second; both happen inside one transaction with a row lock; the operation is idempotent. "The button is disabled" is not an answer.

## Deadlocks — Cheap

Two transactions wait on each other's locks forever; Postgres detects and aborts one. Avoid them by keeping transactions short, touching tables in a consistent order inside functions, and not calling external services (Claude) inside a transaction. If one is reported, retry the aborted transaction once.
