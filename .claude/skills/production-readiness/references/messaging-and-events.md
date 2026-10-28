# Messaging and event-driven systems

At Jarso's scale there is one database and one app. Almost every pattern in this file is replaced by "a Postgres table and a transaction". The entries explain the pattern so you recognise when the cheap version stops being enough.

## Message queues — Cheap

A buffer between a producer and a consumer so work can happen later or elsewhere. Needed when work must outlive the request (long generation, email batches) or must survive a crash.

Our move: a `jobs` table (`id, kind, payload jsonb, status, attempts, next_run_at, last_error, created_at`) drained by a cron route or `pg_cron`, or Supabase Queues (built on `pgmq`) if you want visibility timeouts and archiving for free. Claim rows with `update … where status = 'queued' and next_run_at <= now() … for update skip locked … returning *` so two runs cannot take the same job. No broker, no worker fleet.

## Pub/Sub — Know

Publishers emit events; many subscribers receive them without coupling. Supabase Realtime can broadcast database changes to browsers, and Database Webhooks can call an HTTP endpoint on insert/update. Neither is needed for v1. If a parent view should update live when the child logs a purchase, Realtime on the ledger table is the ten-line version.

## Event-driven architecture — Cheap

Components react to facts ("entry recorded") instead of being called directly. We already do the smallest form: the `on_auth_user_created` trigger creates a profile. Use triggers for data invariants (keep a derived balance in sync, stamp `updated_at`) and `after()` from `next/server` for post-response work that may fail safely (analytics, a non-critical notification). Keep the count of triggers small and documented in `docs/database.md`; invisible side effects are the cost of this pattern.

## Distributed transactions — Know

Committing across two systems atomically. Avoided by keeping all state in Postgres. The one unavoidable pair is "call Claude, then save the answer": insert a `guide_messages` row with `status = 'pending'` first, call Claude, then update it. A crash in between leaves a pending row you can retry or expire, never a lost or doubled charge.

## Saga pattern — Know

A sequence of local transactions with compensating actions for rollback, used when one transaction cannot span services. While everything is in one Postgres, a single transaction (a function called via `rpc`) replaces the saga. Remember the name for when a payment provider or external ledger ever appears.

## Dead letter queues — Cheap

Where messages go after they fail too many times, so they are not lost and not retried forever. On the jobs table this is `status = 'failed'` with `last_error` populated. Write the query that lists them and look at it weekly, or alert when the count is non-zero. A DLQ nobody reads is a trash can.

## Cron jobs — Do

Scheduled work. Two good options:
- `pg_cron` inside Supabase, calling a SQL function. Best when the work is pure SQL (compute weekly summaries, expire stale rows).
- The host's cron hitting `/api/cron/<job>`, guarded by comparing a `CRON_SECRET` header. Best when the work needs the Claude API or app code.

Rules: idempotent on a natural key, chunked (process N users per invocation and reschedule), logged (a `job_runs` row per run with counts and duration), and timed well under the function limit. For FR11 weekly reviews, generate per `(user_id, week_start)`; for FR06 spaced repetition, a nightly job that schedules tomorrow's review items.

## WebSockets — Know

Persistent two-way connections. Serverless functions cannot hold them. Supabase Realtime provides them as a service if the UI ever needs live push. The guide's streaming does not need WebSockets; see SSE.

## Long polling — Know

The client asks repeatedly and the server holds the request until there is news. A fallback from the pre-SSE era. Not planned; if streaming is blocked by some network, the guide can fall back to a non-streamed answer.

## Server-Sent Events — Do

One-way streaming from server to client over plain HTTP. This is how the guide should deliver answers: a Route Handler returns a `Response` with a `ReadableStream`, `Content-Type: text/event-stream`, and pipes Claude's stream events into it. Next.js also supports streaming from Server Actions via async iterables, which keeps `useActionState` ergonomics. Either way: set `maxDuration`, send a first token quickly, send a terminal event, and handle client disconnects by aborting the upstream call so tokens stop being billed.
