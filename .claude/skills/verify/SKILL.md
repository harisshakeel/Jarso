---
name: verify
description: Run the full verification pipeline (Biome, typecheck, unit tests, build, e2e, DB reset) and report results honestly. Use before declaring any task done or committing.
---

# Verify

Run in order; stop and fix on first failure.

```bash
pnpm lint:fix && pnpm lint
pnpm typecheck
pnpm test
NEXT_PUBLIC_APP_URL=http://localhost:3000 \
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=placeholder pnpm build   # skip env prefix if .env.local exists
```

If migrations changed: `pnpm db:reset && pnpm exec supabase db lint --local --fail-on error && pnpm db:types` (needs Docker).

If routes/flows changed: `pnpm test:e2e`.

## Report

- List each command and pass/fail. Quote failure output verbatim.
- Never claim success for a step you skipped — say it was skipped and why.
- Check the build route table: request-time routes should be `◐` (partial) not unexpectedly `ƒ`.
