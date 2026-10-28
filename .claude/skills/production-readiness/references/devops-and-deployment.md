# DevOps, containers and deployment

The host builds and deploys the app from GitHub; Supabase is managed. The concepts below mostly map to platform buttons. Our real responsibilities are backward-compatible migrations, a known rollback path, and a health check that something external watches.

## CI/CD — Do

Automated verification and delivery. `.github/workflows/ci.yml` already lints, typechecks, tests, builds, runs e2e and resets migrations on a fresh database. Still to add when the host is connected: a preview deployment per PR, and a job that applies migrations to the hosted project on merge to `main` (`supabase db push --linked` with the access token and project ref as repository secrets). Migrations from a laptop should become the exception.

## Docker — Know

Packaging an app with its runtime. We use it only because local Supabase runs in containers. The app itself is built by the host. A `Dockerfile` becomes relevant only if moving to a VM or container platform; Next.js supports `output: "standalone"` for that day.

## Kubernetes — Know

Orchestration for many containers across many machines. Not appropriate for one app with 60 users; the operational cost dwarfs the app. Learn the vocabulary (pods, deployments, probes, HPA) because it maps onto what the host does invisibly.

## Feature flags — Cheap

Turning behaviour on or off without a deploy. Two tiers: an env var (`FEATURE_GUIDE=true`, validated in `env.server.ts`) for coarse switches, and a `feature_flags` table (`key, enabled, user_ids uuid[]`) read server-side when a few test accounts should see a feature first. Check flags in the service or page, never in the client bundle. Delete a flag once the feature has been on for everyone for a couple of weeks.

## Blue-green deployment — Know

Two identical environments; switch traffic from the old to the new atomically, switch back if needed. Immutable deployments with instant promotion on the host give the same property. The database is the part that cannot be blue-green, hence expand/contract migrations.

## Canary releases — Know

Send a small share of traffic to the new version first. With 60 users a 5% canary is three children. Use a feature flag scoped to test accounts instead.

## Rolling deployments — Know

Replace instances gradually so both versions run briefly. The host does this. The consequence for us: for a minute, old code and new code both talk to the same schema. Migrations must be compatible with both (add nullable columns first, backfill, then make them required in a later deploy).

## Rollbacks — Do

Returning to the previous version quickly. The host offers one-click rollback to a previous deployment; know where it is. Because the schema does not roll back, write migrations so the previous code still works against the new schema (expand/contract, `docs/database.md` rule 10). If a migration itself is wrong, write a forward migration that fixes it.

## Health checks — Do

An endpoint that reports whether the app is up. `/api/health` exists and is shallow (the function runs). Add a deep check, for example `/api/health?deep=1`, that performs a trivial Supabase query with a short timeout and reports `{ db: "ok" }`. Point an external uptime monitor at the deep check every minute; it is the first alert you will ever get.

## Liveness and readiness probes — Know

Kubernetes names for "is the process alive" and "can it serve traffic". Shallow health is liveness; deep health is readiness. Serverless platforms do not probe, so the uptime monitor plays that role.
