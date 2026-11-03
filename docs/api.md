# Backend: Server Actions & Route Handlers

## Which one?

| Use | When |
| --- | --- |
| **Server Action** (`features/<f>/server/actions.ts`) | Mutations triggered by this app's own UI (forms, buttons). Default choice. |
| **Route Handler** (`app/api/v1/**/route.ts`) | Anything called by something other than our React UI: mobile apps, webhooks, third parties, cron, public API. |

Both must stay thin and call the feature **service**.

Scheduled work (allowance generation, handover reminders) runs as pg_cron jobs in Postgres. Three cron routes exist today, because their work needs app code: `/api/cron/payments/auto-charge` (charging a card, ADR 0013 card handover), `/api/cron/push` (sending push, ADR 0012 web push; called every 15 minutes by the pg_cron job `push-sweep`) and `/api/cron/guide/noticed` (Jarso's weekly nudges, which may ask Claude to word a line). All take the same `CRON_SECRET`. More arrive with email delivery in the final demo.

## Bearer auth for non-browser callers

One token path, `verifyBearer()` in `apps/web/src/lib/supabase/request-scope.ts`: it reads `Authorization: Bearer <jwt>`, verifies it with `getClaims(jwt)` on a stateless client (`createStatelessClient`, `@/lib/supabase/stateless`: no cookies, no session persistence, the app's timed fetch), and accepts only a signed-in user's access token (`sub` a UUID, `role` and `aud` `authenticated`, not anonymous). A malformed, invalid or wrong-kind token is `UNAUTHORIZED` and never falls back to cookies; a slow verify is `UNAVAILABLE`. The token is never logged or put in an error.

Two ways to use it:

- **`withApi(handler, { bearer: true })`** (the outbox, guide and learning start routes). With the header, the handler runs in a request scope (`AsyncLocalStorage`): `getCurrentUser()` returns the token's user and `createClient()` returns a client acting as them (`accessToken` option, so RLS applies and any `client.auth.*` call throws), so `assertUser`, `assertRole`, `getMembership` and every service work unchanged. Cookies are never read, even if the request also carries them: the bearer wins. Without the header the route runs on the cookie session, as before. A route without `bearer: true` ignores the header. A guide turn's work runs in its stream's `start()`, which keeps the scope; `after()` callbacks inherit it too.
- **`assertRequestUser(request)`** (`apps/web/src/features/auth/server/request-user.ts`, used by `/api/v1/notices/dispatch`): the bearer's `{ id, email }`, or `assertUser()` with no header. It opens no scope, so only use it where the handler needs nothing past the user's id.

`withApi`'s same-origin check stays: React Native sends no `Origin` and a bearer request carries no cookies, so it passes and is not CSRF-exposed. Expo web in development (`localhost:8081`) does send an `Origin`, so its POSTs get `403 FORBIDDEN`; that is expected, test on a device or simulator.

**When to add a `/api/v1` route for mobile.** Only when the work needs a server secret (service key, Claude, payment provider, `CRON_SECRET`). Anything RLS and a Postgres function can authorise is a direct Supabase call from `@jarso/data` (ADR 0016).

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
| POST | `/api/v1/auth/child-sign-in` | – (rate-limited) | Child PIN sign-in for the phone; returns `{ accessToken, refreshToken, expiresAt }` (ADR 0016) |
| POST | `/api/v1/push/tokens` | user (bearer; any approved member, parent or child) | Register this phone's Expo push token (`{ token, platform: "android" }`), taking it over from any other account on the phone; at most 10 per member; 201 `{ id }`; 403 outside a family |
| DELETE | `/api/v1/push/tokens` | user (bearer) | Forget this phone's token for the caller (`{ token }`), before sign-out; `{ removed }` |
| POST | `/api/v1/notices/dispatch` | user (bearer) | Send web and phone push for pending notices (queued when either transport is on); 30 per 10 min per user; 202 |
| POST | `/api/v1/outbox` | child (cookie or bearer) | One queued child action from the device outbox (`outboxRequestSchema`) |
| POST | `/api/v1/guide/turns` | child or parent (cookie or bearer) | One message to Jarso, streamed as NDJSON (`askGuideSchema`) |
| GET | `/api/v1/guide/state` | child (cookie or bearer) | `{ data: { available, introNeeded } }` from `getGuideState`; for the phone, which cannot read the server's guide switch |
| POST | `/api/v1/learning/start` | child (cookie or bearer) | Start or resume a mission (`startMissionSchema`); `{ data }` is `startMission`'s result, `{ attemptId, results }`. 403 for a locked mission, 404 for an unknown one |
| POST | `/api/v1/payments/webhooks/[provider]` | provider signature | A payment provider's signed event (ADR 0013) |
| GET, POST | `/api/cron/payments/auto-charge` | `Authorization: Bearer <CRON_SECRET>` | Charge every due item with auto charge on |
| GET, POST | `/api/cron/push` | `Authorization: Bearer $CRON_SECRET` | Push sweep (ADR 0012), web and phone, then the Expo receipt check (`receipts: { checked, dropped }` in the answer), every 15 minutes from pg_cron (`push-sweep` → `trigger_push_sweep`, POST via pg_net); GET for a manual run; 404 when the secret is unset |
| GET | `/api/cron/guide/noticed` | `Authorization: Bearer $CRON_SECRET` | Jarso noticed: the weekly nudges (demo 3); 404 when the secret is unset |

### `POST /api/v1/outbox`

Called only by the device outbox (`packages/core/src/offline/outbox/send.ts`, on the web and the phone), one item at a time.
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

Called by the Ask Jarso window on the child's Home (`packages/core/src/guide/send-turn.ts`), the one Route Handler our own UI calls for a reason other than the outbox: a Server Action can't stream status lines (ADR 0011). Body: `askGuideSchema` (`clientMessageId`, `conversationId`, `context`, `text`). `context.entry` is where the chat was opened; `{ entry: "parent", childId }` is a parent asking about one of their own children from the parent's Home (the parent role is checked, the child must be theirs, the chat is stored on the child with `asked_by` set, no memories are read or kept). Every check (child or parent role, the deployment flag and the parent's switch, on unless a parent turned it off, a re-sent question, the context key, the chat, the rate limits) runs first and fails with the usual JSON error envelope and status. After that the response is `200 application/x-ndjson`, one JSON object per line:

- `{ "type": "status", "text": "Peeking in your jars…" }` — where Jarso is: one per phase (`guideCopy.phases`: reading the question, putting an answer together, double-checking it) and one per look-up (`guideCopy.status`), all fixed copy;
- then `{ "type": "reply", "data": AskGuideResult }` (the screened reply, in one piece), or `{ "type": "error", "error": { "code", "message" } }`.

No model text ever streams. `maxDuration` 60 s (the turn's own deadline is 45 s).

The Jarso pages (`/child/jarso`, `/parent/jarso`) read past chats through the guide's server barrel, never a Route Handler: `listMyChats()` / `getMyTranscript(id)` for the signed-in child's own chats (a parent's chat about them, `asked_by` set, is never theirs), and `listParentChats()` / `getParentTranscript(id)` for the signed-in parent's own chats about their children. A reopened chat continues with its `conversationId` through the same `POST /api/v1/guide/turns`.

#### What Jarso offers, and the user's tap (ADR 0011, amendment of 2026-11-03)

A reply's `proposal` is a goal (`{ kind: "goal", … }`, from `propose_goal`) or a prepared action (`{ kind: "action", draft, title, lines }`, from `propose_action`). The model never writes: only these Server Actions, called from the card under the reply, do anything, and each runs as the signed-in user.

| Server Action (`features/guide/server/actions.ts`) | Who | Schema | What it does |
| --- | --- | --- | --- |
| `acceptGoalProposalAction` | child | `acceptGoalProposalSchema` | Saves the offered goal through the goals service. A different active goal returns `{ status: "has_goal", existing }` until the child sends `replace: true`, which archives it first. A plan over the allowance is left off (`planKept: false`). |
| `confirmActionDraftAction` | child or parent | `confirmActionDraftSchema` (`{ draft: ActionDraft }`) | Runs the draft through the feature service the app's own form uses (diary, requests, allowance), after checking it against that form's schema again. Children may run only `money_received`, `purchase`, `jar_move`, `savings_request`; parents only `hand_over_allowance`, `record_gift`, `change_allowance`, `decide_request`. The draft's `id` is the idempotency key, so a double tap records once. Returns `ActionOutcome`: `status` `done`, `waiting` (a parent still has to act) or `declined` (a refusal the form would show), one line of text from the service's result, and the child's jars after it. A service's `AppError` comes back as the usual failure with its safe message. |
| `readPriceFromPhotoAction` | child | `readPriceSchema` (`{ image }`: a JPEG, PNG or WebP data URL, at most 700 KB, which keeps it under the 1 MB Server Action body limit) | Reads the main price on a photo with Claude Haiku 5.5 (structured output; the price is parsed in code) and returns `PhotoPriceResult`: a ready question for Jarso and a goal offer, or `{ found: false, reason }`. Same switches, rate limits (it counts as a message), budget and breaker as a turn. The photo is never stored or logged. |

### `POST /api/v1/payments/webhooks/[provider]`

Called by the payment provider, never by our UI (`apps/web/src/app/api/v1/payments/webhooks/[provider]/route.ts`). `[provider]` must be a provider that is on (all its env keys set; `fake` needs `PAYMENTS_ALLOW_FAKE=true`); an unknown or inactive one, or no provider on, returns 404. The route reads the raw body once with `req.text()`, passes it and the headers to `provider.parseWebhook` (signature check, live-mode rejection, event mapping), then calls `handleProviderEvent`. There is no session: the signature is the authentication, and the signing secret is `STRIPE_WEBHOOK_SECRET` for Stripe and `RAZORPAY_WEBHOOK_SECRET` for Razorpay (HMAC-SHA256 of the raw body in `x-razorpay-signature`; the event id comes from `x-razorpay-event-id`).

| Status | Meaning |
| --- | --- |
| 200 `{ data: { received: true } }` | Handled, ignored (an event type we don't map), or a payment this database doesn't know. The provider stops retrying |
| 400 `VALIDATION` | Bad signature, or a live-mode event |
| 404 `NOT_FOUND` | Unknown provider, or that provider is off |
| 5xx | A processing failure. The provider retries; the status machine and the `payment_webhook_events` key make a replay harmless |

### `POST /api/v1/payments/razorpay/return`

Where Razorpay Checkout posts its form after the save-card page (`apps/web/src/app/api/v1/payments/razorpay/return/route.ts`). It is the only `withApi` route with `{ crossOrigin: true }`: the post comes from Razorpay's site, so the same-origin check would refuse it. That is safe because the route reads no session, writes nothing and only redirects. Query: `success` and `cancel`, absolute URLs on `NEXT_PUBLIC_APP_URL`'s origin. It answers 303 to `success` when the form has `razorpay_payment_id`, else to `cancel`; with either URL missing or off-origin it answers 303 to `/parent`. The `order.paid` webhook, not this redirect, saves the card. 404 when Razorpay is off.

### `GET /api/cron/guide/noticed`

Calls `runGuideNoticed()` (`features/guide/server/noticed.ts`). A weekly Vercel Cron (`apps/web/vercel.json`, `0 17 * * 0`, Sunday 17:00 UTC) calls it with `Authorization: Bearer $CRON_SECRET` (constant-time compare); 404 when `CRON_SECRET` is unset, 401 for a wrong secret. For each approved child it reads `guide_noticed_inputs`, picks at most one signal in code (a goal quarter mark, a saving streak of 3, 5, 8 or 12 allowances, a parent-only spending week over twice the one before, or 14 quiet days), and records it with `guide_noticed_record`, which writes the child's and the parents' notices. Where Jarso is on for the child and the guide is up, under its breaker and within budget, Claude Haiku may reword the child's line; the reworded line must keep exactly the fixed line's figure refs and pass the output screen, or the fixed line goes out. Nothing about a child whose parent turned Jarso off is sent to Anthropic. A repeat is harmless (a signal is sent once; one nudge per child in 6 days). Stops starting children after 40 s; `maxDuration` 60 s. Returns counts only: `{children, nudged, notices, worded, quiet, failed, timedOut}`.

### `GET|POST /api/cron/payments/auto-charge`

Calls `runAutoCharges()`: every due item with auto charge on, a saved card and no earlier auto attempt is claimed once and charged. Needs `Authorization: Bearer <CRON_SECRET>` (constant-time compare). Returns 404 when `CRON_SECRET` is unset or payments are off, and 401 for a wrong secret. pg_cron calls it hourly at :09 with POST through pg_net; a daily Vercel Cron (`apps/web/vercel.json`, `30 3 * * *`) calls it with GET as a fallback. A missed or doubled run is harmless. `maxDuration` 60 s.

`/dev/payments/fake` is a page, not an endpoint: the fake provider's hosted checkout for tests and local runs. It is a 404 unless the fake provider is on (`PAYMENTS_ALLOW_FAKE=true`, never on Vercel production).
