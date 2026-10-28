# Monitoring and observability

Goal: when something breaks for a child, you find out within minutes and can see what happened without reproducing it. At this scale that means an uptime monitor, an error tracker, structured logs with a request id, and two numbers you check weekly.

## Monitoring — Do

Watching known signals. Three sources suffice: an external uptime monitor on the deep health check, the host's dashboard (invocations, errors, duration), and Supabase's dashboard (CPU, connections, slow queries). Look at the dashboards after each deploy and once a week.

## Logging — Do

Recording events for later inspection. `logger` from `@/lib` already emits structured JSON in production. Add a per-request id (generate in `proxy.ts`, pass as a header, read in handlers) and include `userId` on server logs so one child's journey can be followed. Never log emails, tokens, prompts verbatim or full rows; children's data deserves the same minimisation in logs as in the database. Keep `LOG_LEVEL=info` in production and use `debug` locally.

## Distributed tracing — Know

Following one request across many services with a shared trace id. With one service, the request id in logs is the trace. If a worker or second service appears, Next.js supports OpenTelemetry through `instrumentation.ts`, and most error trackers accept traces. Not before then.

## Metrics — Cheap

Numbers over time. The ones that matter for Jarso: daily active children, missions completed, guide calls and tokens per child, failed jobs, error rate, p95 latency. The first five come from SQL over our own tables; write one query per metric in `docs/` and run them weekly or wire them to a tiny internal page. The last two come from the host and the error tracker. No metrics product.

## Alerts — Do

Being told, not having to look. Three alerts: uptime monitor down for two checks; error rate spike or new error type from the error tracker; Claude spend above a monthly threshold (provider billing alert plus our own daily token sum). Route them to a channel or inbox someone reads. More alerts than that get ignored.

## SLOs — Cheap

A target for a service level, agreed in advance. Two are enough and should be written in `docs/operations.md`: availability of the deep health check at 99.5% over 30 days (about 3.5 hours of downtime allowed), and p95 dashboard page load under 2 seconds from the target region. The guide gets a softer one: 95% of answers start streaming within 3 seconds.

## SLIs — Cheap

The measurements behind SLOs. Availability comes from the uptime monitor's success rate; latency from the host's speed insights or the error tracker's performance view. Nothing custom to build.

## Error budgets — Know

The allowed failure under an SLO (0.5% of a month). The policy at this scale is one sentence: if the budget is blown in a month, the next sprint prioritises stability over features. It stops the "ship faster" and "be reliable" arguments from being decided by mood.

## Observability — Cheap

The ability to ask new questions of the system without deploying new code. For us: an error tracker (Sentry's free tier or equivalent) wired to both the client and the server with source maps, structured logs with request and user ids, and the two SLIs. That combination answers "what did this child see at 16:02 and why" for any incident we are likely to have.
