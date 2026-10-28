# 0001. Next.js full-stack app organised by feature modules

- Status: Accepted
- Date: 2026-10-28

## Context

Frontend and backend ship together. We need a structure that stays navigable as features multiply and lets backend logic be reused by UI and HTTP clients.

## Decision

One Next.js 16 App Router app. Code is grouped by domain in `src/features/<name>` with a fixed internal shape (`components/`, `schemas.ts`, `types.ts`, `server/{actions,service,repository}`). `src/app` is a thin routing layer. Backend entry points are Server Actions (own UI) and versioned Route Handlers (`/api/v1`, external callers); both delegate to services.

## Consequences

- New features are additive and self-contained; ownership is clear.
- Services are framework-light and can be lifted into a separate backend later.
- Requires discipline on boundaries (enforced via barrels + `server-only`).
- Single deployable; no separate API service to operate yet.
