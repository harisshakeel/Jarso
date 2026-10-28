# Backend: Server Actions & Route Handlers

## Which one?

| Use | When |
| --- | --- |
| **Server Action** (`features/<f>/server/actions.ts`) | Mutations triggered by this app's own UI (forms, buttons). Default choice. |
| **Route Handler** (`app/api/v1/**/route.ts`) | Anything called by something other than our React UI: mobile apps, webhooks, third parties, cron, public API. |

Both must stay thin and call the feature **service**.

## Server Actions

```ts
"use server";
export const updateProfileAction = createAction(updateProfileSchema, async (input) => {
  const user = await assertUser();            // authN
  const profile = await updateProfile(user.id, input); // service
  refresh();                                   // or revalidatePath / updateTag
  return profile;
});
```

- `createAction(schema, handler)` accepts `FormData` or an object, validates with Zod, returns `ActionResult<T>`:
  `{ ok: true, data } | { ok: false, error: { code, message, fieldErrors? } }`.
- Use with `useActionState(action, idle)` in client components.
- Server Actions are public HTTP endpoints — always authenticate and authorize inside them.

## Route Handlers

```ts
export const PATCH = withApi(async (request: Request) => {
  const user = await assertUser();
  const input = await parseBody(request, updateProfileSchema);
  return json(await updateProfile(user.id, input));
});
```

Response envelope:

- Success: `{ "data": … }`
- Error: `{ "error": { "code": "VALIDATION", "message": "…", "details"?: … } }` with matching HTTP status.

Conventions: version under `/api/v1`, plural nouns for collections (`/api/v1/projects/[id]`), validate params/query/body with Zod, never return raw DB rows.

## Existing endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | – | Liveness |
| GET | `/api/v1/me` | user | Current user's profile |
| PATCH | `/api/v1/me` | user | Update profile (`updateProfileSchema`) |
