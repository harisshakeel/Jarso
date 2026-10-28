# 0003. Biome for lint/format; index barrels as module boundaries

- Status: Accepted
- Date: 2026-10-28

## Context

Want one fast tool for lint + format, and explicit public APIs per module.

## Decision

Biome replaces ESLint + Prettier. Every module exposes an `index.ts` barrel; cross-module imports go through it. Server-only APIs get a separate `server/index.ts` barrel guarded by `import "server-only"` so client bundles can't pull server code.

## Consequences

- Single config (`biome.json`), fast pre-commit.
- Refactors inside a module don't break consumers.
- Barrels must be kept in sync (incl. after `shadcn add`); never mix server/client exports in one barrel.
