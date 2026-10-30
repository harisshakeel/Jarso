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
- `schema` may instead be an async factory, called per request, when the schema depends on server context (e.g. `allowanceSchema(currency, today)` from the family). An `AppError` thrown by the factory becomes a typed failure.
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
| POST | `/api/v1/outbox` | child | One queued child action from the device outbox (`outboxRequestSchema`) |

### `POST /api/v1/outbox`

Called only by the device outbox (`src/features/offline/outbox/send.ts`), one item at a time.
Body: `{ kind, userId, payload }`, `kind` one of `purchase | practice | step | completeMission |
checkIn`. `payload` is exactly that feature's schema input (`purchaseSchema(currency)`,
`recordPracticeSchema`, `recordStepSchema`, `completeMissionSchema`, `completeCheckInSchema`),
plus the device `occurredAt`; the step and check-in schemas strip it. The route calls the same
service as the online form, so `assertRole("child")` and the idempotency keys apply unchanged.

| Status | Meaning | Outbox does |
| --- | --- | --- |
| 200 `{ data }` | The service's result (a replayed key returns the original entry) | Removes the item |
| 400 `VALIDATION` | Unknown `kind` or a payload the schema refuses; message is the calm 22023 wording | "Needs a look" |
| 401 `UNAUTHORIZED` | Signed out, or `userId` is not the signed-in user | Pauses the item |
| 403 `FORBIDDEN` | Not a child (`assertRole`), or a cross-origin request (`withApi` guard) | "Needs a look" |
| 409 `CONFLICT` | A purchase larger than the Spend jar (the purchase sheet's sentence) | "Needs a look" |
| 503 `UNAVAILABLE` | The database was slow or down | Retries with backoff |

Every refusal message is shown to the child, so it never carries Zod details. `maxDuration = 30`.
