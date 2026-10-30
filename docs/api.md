# Backend: Server Actions & Route Handlers

## Which one?

| Use | When |
| --- | --- |
| **Server Action** (`features/<f>/server/actions.ts`) | Mutations triggered by this app's own UI (forms, buttons). Default choice. |
| **Route Handler** (`app/api/v1/**/route.ts`) | Anything called by something other than our React UI: mobile apps, webhooks, third parties, cron, public API. |

Both must stay thin and call the feature **service**.

There is no `/api/cron` route yet. Scheduled work (allowance generation, handover reminders) runs as pg_cron jobs in Postgres. A cron route arrives with email delivery in the final demo.

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
| POST | `/api/v1/guide/turns` | child | One message to Jarso, streamed as NDJSON (`askGuideSchema`) |

### `POST /api/v1/outbox`

Called only by the device outbox (`src/features/offline/outbox/send.ts`), one item at a time.
Body: `{ kind, userId, ageMs, payload }`, `kind` one of `purchase | practice | step |
completeMission | checkIn`. `payload` is exactly that feature's schema input
(`purchaseSchema(currency)`, `recordPracticeSchema`, `recordStepSchema`, `completeMissionSchema`,
`completeCheckInSchema`); none has a time, so a client `occurredAt` is stripped. `ageMs` (integer
≥ 0) is how long ago the child did it on the device clock; the route sets `occurredAt = now -
min(ageMs, 7 days - 1 min)` on the server clock for purchases, practice and mission completion,
so a wrong device clock cancels out. The route calls the same service as the online form, so
`assertRole("child")` and the idempotency keys apply unchanged.

| Status | Meaning | Outbox does |
| --- | --- | --- |
| 200 `{ data }` | The service's result (a replayed key returns the original entry) | Removes the item |
| 400 `VALIDATION` | Unknown `kind` or a payload the schema refuses; message is the calm 22023 wording | "Needs a look" |
| 401 `UNAUTHORIZED` | Signed out, or `userId` is not the signed-in user | Pauses the item |
| 403 `FORBIDDEN` | Not a child (`assertRole`), or a cross-origin request (`withApi` guard) | "Needs a look" |
| 409 `CONFLICT` | A purchase larger than the Spend jar (the purchase sheet's sentence) | "Needs a look" |
| 503 `UNAVAILABLE` | The database was slow or down | Retries with backoff |

Every refusal message is shown to the child, so it never carries Zod details. `maxDuration = 30`.

### `POST /api/v1/guide/turns`

Called by the Ask Jarso window on the child's Home (`src/features/guide/send-turn.ts`), the one Route Handler our own UI calls for a reason other than the outbox: a Server Action can't stream status lines (ADR 0011). Body: `askGuideSchema` (`clientMessageId`, `conversationId`, `context`, `text`). Every check (child role, the deployment flag and the parent's switch under the current consent, a re-sent question, the context key, the chat, the rate limits) runs first and fails with the usual JSON error envelope and status. After that the response is `200 application/x-ndjson`, one JSON object per line:

- `{ "type": "status", "text": "Looking at your jars…" }` — one per look-up, fixed copy from `guideCopy.status`;
- then `{ "type": "reply", "data": AskGuideResult }` (the screened reply, in one piece), or `{ "type": "error", "error": { "code", "message" } }`.

No model text ever streams. `maxDuration` 60 s (the turn's own deadline is 45 s).
