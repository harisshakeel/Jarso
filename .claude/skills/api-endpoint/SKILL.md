---
name: api-endpoint
description: Add a versioned Next.js Route Handler under src/app/api/v1 that validates input with Zod, authenticates, and delegates to a feature service. Use when a non-UI caller (mobile, webhook, cron, third party) needs HTTP access.
---

# API endpoint

Default to a Server Action for our own UI (`server-action` skill). Use a Route Handler only for external callers. Read `docs/api.md`.

## Template

`src/app/api/v1/<resource>/route.ts` (or `[id]/route.ts`):

```ts
import { assertUser } from "@/features/auth/server";
import { createThingSchema } from "@/features/things";
import { createThing, listThings } from "@/features/things/server";
import { json, parseBody, withApi } from "@/lib/api";

export const GET = withApi(async () => {
  const user = await assertUser();
  return json(await listThings(user.id));
});

export const POST = withApi(async (request: Request) => {
  const user = await assertUser();
  const input = await parseBody(request, createThingSchema);
  return json(await createThing(user.id, input), { status: 201 });
});
```

Dynamic segments: `export const GET = withApi(async (_req: Request, ctx: RouteContext<"/api/v1/things/[id]">) => { const { id } = await ctx.params; … })` — validate `id` with Zod.

## Rules

- Always wrap with `withApi`; always authenticate (unless deliberately public — then document why).
- Validate params, query and body with Zod. Return domain types, never raw rows.
- Envelope: `{ data }` / `{ error: { code, message, details? } }`.
- Webhooks: verify signatures before parsing; use `createAdminClient()` only after verification.
- Add the endpoint to the table in `docs/api.md`.
- Add an e2e or integration test for auth (401 when signed out).
