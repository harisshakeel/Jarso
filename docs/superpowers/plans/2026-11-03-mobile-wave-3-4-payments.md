# Mobile wave 3, plan 4 of 4: native card payments (Android) Implementation Plan

> **Status: shipped** in #96 and #102.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A parent hands over an allowance or gift by card, and saves a card by turning auto charge on, through Stripe PaymentSheet and Razorpay Checkout on the Android app, with the provider webhook still the only source of success.

**Architecture:** The provider contract (`packages/core/src/lib/payments-types.ts`) gains in-app methods that return the params a native sheet needs. The web payments service reuses its hosted-flow rules (validation, one live payment per item, reuse, provider switch, expiry) for a new `in_app` payment channel. Bearer `/api/v1/payments/*` routes expose it to the phone. The phone opens the sheet, then polls `GET /payments/:id` and never reports success itself. Stripe in-app PaymentIntents carry `metadata.jarsoInApp = "1"` and Razorpay in-app orders carry a `jarsoPay` note, so the webhook mapping can treat them differently from auto charges.

**Tech Stack:** Next.js 16 route handlers (`withApi` bearer scope), Supabase Postgres (one migration), `stripe` 23.1.0, `razorpay` 2.9.8, Expo SDK 58 dev build, `@stripe/stripe-react-native`, `react-native-razorpay`, TanStack Query, Vitest, jest-expo, pgTAP, Maestro.

**Spec:** `docs/superpowers/specs/2026-11-03-mobile-wave-3-design.md` (Goal 2, Anti-goals, §3 payment rows, §4 Native payments, §8 card flows, payment items of Done when). Background: `docs/superpowers/specs/2026-10-31-stripe-card-handover-design.md`, `2026-11-01-multi-provider-razorpay-design.md`, ADR 0013, 0014, 0017.

## Global Constraints

- Follow `CLAUDE.md` hard rules: route → service → repository; only repositories name tables or columns; Zod on every input (`parseBody`); `AppError` + `logger`; no `console.log`; Biome only; barrels; server-only API stays in `features/payments/server`.
- `packages/core` and `packages/data` stay pure: no React, Next, `server-only`, `@/**` or platform globals.
- Money is integer minor units end to end. The card always pays the item's full amount (`cashMinor + savedMinor === amountMinor`).
- "Provider webhooks stay the only source of truth for success; the phone only shows status it reads back from the server." The phone never calls an endpoint that marks a payment paid. The one exception is the fake provider in dev builds, which goes through the same `handleProviderEvent` path the fake webhook uses.
- "Only the provider *publishable* key or key id reaches the phone, and it comes from the API response, not from `EXPO_PUBLIC_*`." No new `EXPO_PUBLIC_*` variable.
- Test mode only: `STRIPE_SECRET_KEY` `^(sk|rk)_test_`, new `STRIPE_PUBLISHABLE_KEY` `^pk_test_`, `RAZORPAY_KEY_ID` `^rzp_test_`. Razorpay is INR only.
- `CHECKOUT_MINUTES` (31) is the in-app payment's own `expires_at`. PaymentIntents and Razorpay orders have no provider-side expiry.
- Every payments bearer route checks the parent role on the server (`assertRole("parent")` or a service that calls `assertParentOf`). A child token gets 403.
- Children never see payment state, providers or card details.
- Native modules need the `development` EAS profile and `expo-dev-client` from plan 3. Expo Go cannot run this.
- Parent screens use plan 1's type tokens only (`text-h3`, `text-body-parent`, `text-small`, `text-money`, …). No raw `text-Nxl`.
- Copy lives in `@jarso/core/payments` `paymentCopy`. The phone never rewords it.
- Never read `.env*` files and never print a key. Use placeholders only (`pk_test_…`, `sk_test_…`, `rzp_test_…`).
- Database work goes to the hosted project only (no Docker). Run `db push --linked --dry-run`, then **ask the user** before the real push. pgTAP runs in the PR's CI `migrations` job; say so rather than claim it ran.
- **Commit only after the user says so** (project memory "no commit until asked"). Each task's commit step gives the message to use: Conventional Commits, subject ≤ 60 chars, no AI attribution, one logical change per commit.
- Verification for every task: `pnpm check` (lint + typecheck + unit tests) is green before the commit step.

## Review Focus

1. **Sheet closed, reopened after the 31-minute window.** The old in-app payment is expired and its PaymentIntent cancelled at Stripe, and a new payment starts. If the old intent had already succeeded, the cancel call fails and the payment later posts through the webhook (or becomes `succeeded_unapplied`). It never posts twice. Owner: Task 5 (`expires a past-window in-app payment, cancels its intent, and starts a new one`; `keeps going when Stripe refuses to cancel an intent that already succeeded`).
2. **Web hosted checkout and phone in-app checkout for the same item.** Whichever starts second cancels the other's still-`pending` manual payment (it counts as a channel switch, like D7's provider switch). An in-app payment cancelled this way also cancels its intent. Owner: Task 5 (`cancels a live hosted checkout when the phone starts in-app`; `cancels a live in-app payment, and its intent, when the web starts hosted`).
3. **Network drops or the app is backgrounded while polling.** A failed `GET /payments/:id` does not end polling or show an error over the result. Reopening the screen with a live payment shows "Card payment in progress" with Pay again (which reuses the same intent) and Cancel. Owner: Task 10 (`keeps polling after a failed status read`; `shows the live payment on reopen and Pay again reuses it`).
4. **Wrong caller on a payment id.** A child token gets 403 on every payments route. Another family's payment id gets 404 on `GET` and on cancel (RLS returns no row). A co-parent cannot cancel the payer's in-app payment. Owner: Task 7 (`refuses a child token on every payments route`; `answers 404 for a payment the caller cannot read`), Task 6 (`does not cancel another parent's in-app payment`).
5. **3-D Secure or a first decline inside the sheet.** The webhook's `requires_action` / `payment_failed` events for an in-app intent leave the payment `pending`, so the parent can retry in the same sheet and the payment is not ended. Auto-charge intents still fail on those events. Owner: Task 3 map-event tests. Device check: the Maestro 3DS flow in Task 12.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_payments_in_app.sql` | `payments.in_app` column and its checks |
| `packages/core/src/lib/payments-types.ts` | `InAppSheet`, provider in-app methods |
| `packages/core/src/payments/{schemas,status,types,copy}.ts` | route schemas, `isFinalStatus`, wire response types, phone copy |
| `apps/web/src/lib/payments/{stripe,razorpay,fake}/index.ts`, `*/map-event.ts`, `registry.ts` | adapters and mapping |
| `apps/web/src/features/payments/server/{repository,service,end-payment,auto-charge,fake-events,fake-checkout,index}.ts` | in-app channel, ending, sweep, fake completion |
| `apps/web/src/app/api/v1/payments/{in-app,[paymentId],[paymentId]/cancel,auto-charge,cards/[provider],providers,fake/complete}/route.ts` | bearer routes |
| `packages/data/src/payments/{auto-charge,index}.ts` | the toggle's state read for the phone |
| `apps/mobile/src/features/payments/**` | API calls, hooks, sheets, slots |
| `apps/mobile/e2e/card-*.yaml`, `save-card.yaml` | Maestro flows |

---

### Task 1: Migration, `payments.in_app`

The spec says the live payment "stores its native sheet params (client secret / order id)". **Decision:** store only an `in_app` flag. The PaymentIntent id or order id is already in `provider_ref`. The client secret is re-read from Stripe when the sheet is reused. This is needed anyway, because the ephemeral key that goes with the client secret is short-lived and has to be minted again on every open. It also keeps a confirmable client secret out of a table every parent of the child can read. Without a flag, the sweep and `reuseLive` cannot tell an in-app payment from a hosted one that is still opening.

**Files:**
- Create: `supabase/migrations/<timestamp>_payments_in_app.sql` (via `pnpm db:migration payments_in_app`)
- Create: `supabase/tests/database/payments_in_app.test.sql`
- Modify: `packages/db/src/database.types.ts` (regenerated)

**Interfaces:**
- Produces: `payments.in_app boolean not null default false`. Check `payments_in_app_manual`: `not in_app or trigger = 'manual'`. Check `payments_in_app_no_redirect`: `not in_app or redirect_url is null`. Column comment: "Paid in the phone's native sheet (Stripe PaymentIntent / Razorpay order in provider_ref); false for hosted checkouts and auto charges."

- [ ] **Step 1: Write the pgTAP test** (`plan(5)`):
  - `has_column('public','payments','in_app')`
  - `col_default_is(... 'false')`
  - inserting (as service role) an `in_app = true, trigger = 'auto'` row → `throws_ok(..., '23514')`
  - inserting `in_app = true` with `redirect_url = 'https://x.test'` → `throws_ok(..., '23514')`
  - an `in_app = true, trigger = 'manual'` row with `provider_ref = 'pi_test_1'` inserts (`lives_ok`)
  - Use `tests.create_user` plus the family fixtures that `payments_redirect_url.test.sql` uses.
- [ ] **Step 2: Write the migration.** Follow the comment style of `20261031065804_payments_redirect_url.sql`. No policy change: the existing payments policies cover the new column.
- [ ] **Step 3: Dry run.** Run `pnpm exec supabase migration list --linked`, then `pnpm exec supabase db push --linked --dry-run`. Expected: only `<timestamp>_payments_in_app.sql` pending.
- [ ] **Step 4: Ask the user to run `pnpm db:push`** (hosted production database). Wait for their go.
- [ ] **Step 5: Regenerate types.** Run `pnpm db:types:linked`. Expected: the `payments` Row/Insert/Update types gain `in_app`. Run `pnpm check`: PASS. pgTAP runs in CI `migrations`.
- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/*_payments_in_app.sql supabase/tests/database/payments_in_app.test.sql packages/db/src/database.types.ts
git commit -m "feat(db): mark card payments made in the phone's sheet"
```

### Task 2: Contract, wire types and the fake provider's in-app methods

**Files:**
- Modify: `packages/core/src/lib/payments-types.ts`, `packages/core/src/lib/index.ts` (export new types)
- Modify: `packages/core/src/payments/{schemas,status,types,copy}.ts`
- Modify: `apps/web/src/lib/payments/types.ts` (re-export new types)
- Modify: `apps/web/src/lib/payments/fake/index.ts`
- Modify: `apps/web/src/lib/payments/stripe/index.ts`, `razorpay/index.ts` (temporary methods that throw `unavailable()`, replaced in Tasks 3 and 4)
- Test: `packages/core/tests/payments/{schemas,status,copy}.test.ts`, `apps/web/tests/lib/payments/contract.test.ts`

**Interfaces:**
- Produces (core `lib/payments-types.ts`):
```ts
export type InAppSheet =
  | { provider: "stripe"; mode: "payment" | "setup"; publishableKey: string; customerId: string;
      ephemeralKey: string; clientSecret: string }
  | { provider: "razorpay"; mode: "payment" | "setup"; keyId: string; orderId: string;
      amountMinor: number; currency: string; description: string;
      customerId?: string; prefill?: { email: string; contact: string } }
  | { provider: "fake"; mode: "payment" | "setup"; ref: string };

// PaymentProvider gains:
readonly inApp: boolean; // false: this provider shows no button on the phone
createInAppPayment(i: { paymentId: string; amountMinor: number; currency: string; customerRef: string;
  description: string; expiresAt: Date }): Promise<{ providerRef: string; sheet: InAppSheet }>;
resumeInAppPayment(i: { paymentId: string; providerRef: string; customerRef: string; amountMinor: number;
  currency: string; description: string }): Promise<InAppSheet>;
cancelInAppPayment(providerRef: string): Promise<void>; // best effort; a no-op where the provider can't cancel
createInAppSetup(i: { setupId: string; customerRef: string; contact?: { email: string; phone: string } }):
  Promise<{ providerRef: string; sheet: InAppSheet }>;
```
- Produces (core `payments/types.ts`):
  - `InAppPaymentStart = { paymentId: string; expiresAt: string; sheet: InAppSheet }`
  - `InAppSetupStart = { setupId: string; sheet: InAppSheet }`
  - `PaymentStatusView = { id: string; status: StoredStatus; failureCode: FailureCode | null; final: boolean }`
  - `InAppProviders = { cards: AutoChargeCard[]; item: CardPaymentState | null }`
- Produces (core `payments/status.ts`): `isFinalStatus(s: StoredStatus): boolean`. True for `succeeded`, `succeeded_unapplied`, `failed`, `canceled`, `expired`.
- Produces (core `payments/schemas.ts`):
  - `inAppPaymentSchema`: `{ kind: "allowance"|"gift", id: uuid, provider, cashMinor?: int ≥ 0, savedMinor?: int ≥ 0 }`. Refine: both or neither. Message `paymentCopy.fullAmount` on path `cashMinor`.
  - `inAppAutoChargeSchema`: `{ type, id: uuid, on: boolean, provider?, phone? }`, with the same refine as `autoChargeSchema` and no `returnTo`.
  - `paymentIdParamSchema = z.uuid("We couldn't find that.")`.
  - `providersQuerySchema`: all-or-none `{ childId: uuid, kind, id: uuid }`.
  - `fakeInAppCompleteSchema`: `{ mode: "payment"|"setup", ref: uuid, outcome: "pay"|"fail"|"ok"|"decline" }`. Refine: payment ↔ pay|fail, setup ↔ ok|decline.
- Produces (core `paymentCopy`), exact strings:
  - `confirming: "Checking the payment…"`
  - `stillConfirming: "Still confirming with the bank. The jars update as soon as it's through."`
  - `payAgain: "Pay again"`
  - `cancelPayment: "Cancel card payment"`
  - `cancelled: "Card payment cancelled."`
  - `fakeTitle: "Test card (dev build)"`
  - `fakeDetail: "No card is charged. Pick what the card does."`
  - `fakePay: "Pay"`
  - `fakeDecline: "Decline"`
  - `fakeSaveOk: "Save a card that works"`
  - `fakeSaveDecline: "Save a card that declines"`
- Produces (fake adapter): `inApp: true`.
  - `createInAppPayment` → `{ providerRef: "fake_pi_<paymentId>", sheet: { provider: "fake", mode: "payment", ref: paymentId } }`
  - `resumeInAppPayment` → the same sheet
  - `cancelInAppPayment` → no-op
  - `createInAppSetup` → `{ providerRef: "fake_seti_<setupId>", sheet: { provider: "fake", mode: "setup", ref: setupId } }`

- [ ] **Step 1: Write the failing tests.**
  - `status.test.ts`: `isFinalStatus` table over all seven stored statuses (`pending`/`requires_action` false, the rest true).
  - `schemas.test.ts`:
    - `inAppPaymentSchema` accepts `{kind:"allowance",id:<uuid>,provider:"stripe"}` and `{…,cashMinor:300,savedMinor:200}`
    - rejects `{…,cashMinor:300}` (one without the other)
    - rejects `cashMinor:-1` and `cashMinor:1.5`
    - `inAppAutoChargeSchema` rejects `{on:true}` without provider (message `paymentCopy.chooseProvider`)
    - `fakeInAppCompleteSchema` rejects `{mode:"payment",outcome:"ok"}`
  - `contract.test.ts`, new `describe.each` block "in-app", fake only for now:
    - `createInAppPayment` returns a non-empty `providerRef` and `sheet.mode === "payment"`
    - `resumeInAppPayment` returns a sheet for the same provider
    - `cancelInAppPayment` resolves
    - `createInAppSetup` returns `sheet.mode === "setup"`
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @jarso/core test` and `pnpm --filter @jarso/web exec vitest run tests/lib/payments/contract.test.ts`. Expected: FAIL (missing exports/methods).
- [ ] **Step 3: Implement** the types, schemas, copy and fake methods. In Stripe and Razorpay, set `inApp: false` and make the four methods throw that adapter's `unavailable()`. Tasks 3 and 4 replace both.
- [ ] **Step 4: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 5: Commit**
```bash
git commit -m "feat(payments): add in-app sheet contract and fake adapter"
```

### Task 3: Stripe in-app intents, publishable key and webhook rules

**Files:**
- Modify: `apps/web/src/config/env.server.ts` (`STRIPE_PUBLISHABLE_KEY: blankAsUnset(z.string().regex(/^pk_test_/).optional())`), `apps/web/.env.example` (`STRIPE_PUBLISHABLE_KEY=pk_test_…`, comment: "optional; without it Stripe is web-only")
- Modify: `apps/web/src/lib/payments/registry.ts` (pass `publishableKey: serverEnv.STRIPE_PUBLISHABLE_KEY ?? null`; it is not one of the keys that turn Stripe on)
- Modify: `apps/web/src/lib/payments/stripe/index.ts`, `stripe/map-event.ts`
- Create fixtures: `apps/web/tests/lib/payments/stripe/fixtures/{setup-intent-succeeded,payment-intent-canceled}.json`
- Test: `apps/web/tests/lib/payments/stripe/{index,map-event}.test.ts`, `contract.test.ts` (Stripe joins the in-app block), `registry.test.ts`

**Interfaces:**
- Consumes: the Task 2 contract.
- Produces: `createStripePaymentProvider(opts: { secretKey; webhookSecret; publishableKey: string | null; client?: Stripe })`. `inApp = publishableKey !== null`.
  - `createInAppPayment`: `paymentIntents.create({ amount, currency: lower, customer, payment_method_types: ["card"], description, metadata: { paymentId, jarsoInApp: "1" } }, { idempotencyKey: "inapp:<paymentId>" })`, then `ephemeralKeys.create({ customer }, { apiVersion: STRIPE_API_VERSION })`. Returns `{ providerRef: intent.id, sheet: { provider: "stripe", mode: "payment", publishableKey, customerId: customerRef, ephemeralKey: key.secret, clientSecret: intent.client_secret } }`. With no publishable key it throws UNAVAILABLE before calling Stripe.
  - `resumeInAppPayment`: `paymentIntents.retrieve(providerRef)`. If the status is `succeeded` or `processing`, throw `AppError("CONFLICT", paymentCopy.inProgress)`. If `canceled`, throw `AppError("CONFLICT", paymentCopy.badReturn)`. Otherwise mint a fresh ephemeral key and return the sheet.
  - `cancelInAppPayment`: `paymentIntents.cancel(providerRef)`. A `StripeInvalidRequestError` with code `payment_intent_unexpected_state` or `resource_missing` is logged (`stripe intent not cancellable`, `{ providerRef, code }`) and swallowed. Other errors go through `toAppError`.
  - `createInAppSetup`: `setupIntents.create({ customer, payment_method_types: ["card"], usage: "off_session", metadata: { setupId, jarsoInApp: "1" } }, { idempotencyKey: "inapp-setup:<setupId>" })` plus an ephemeral key. Sheet `mode: "setup"`.
- Produces (`mapStripeEvent`), new rules:
  - `const inApp = intent.metadata?.jarsoInApp === "1"`
  - `payment_intent.payment_failed` and `payment_intent.requires_action` → `null` when `inApp`. Auto-charge mapping is unchanged.
  - `payment_intent.succeeded` is unchanged (works for both).
  - `payment_intent.canceled` with `inApp` and `metadata.paymentId` → `{ kind: "payment", eventId, paymentId, providerRef: intent.id, status: "canceled" }`. Without `inApp` → `null`.
  - `setup_intent.succeeded` with `metadata.setupId` **and** `jarsoInApp === "1"`: `retrieveSetupIntent(id)`, then the same card / `setup_failed` logic as the Checkout setup branch (extract it to `setupFromIntent(eventId, setupId, intent)`). Without the marker → `null`, because hosted setups also carry `metadata.setupId` and settle through `checkout.session.completed`.
  - `setup_intent.setup_failed` → `null` (the parent retries in the sheet).

- [ ] **Step 1: Write the failing map-event tests.** `inApp(fixture)` clones and sets `data.object.metadata.jarsoInApp = "1"`.
  - `ignores payment_failed for an in-app intent` → `mapStripeEvent(inApp(paymentIntentFailed))` is `null`
  - `ignores requires_action for an in-app intent` → `null`
  - `still fails an auto-charge intent on payment_failed` → `toMatchObject({ kind: "payment", status: "failed" })` (existing fixture, no marker)
  - `still fails an auto-charge intent on requires_action` → `{ status: "failed", failureCode: "authentication_required" }`
  - `ends an in-app payment on succeeded` → `{ kind: "payment", paymentId: "pay-2", providerRef: "pi_test_1", status: "succeeded" }`
  - `maps payment_intent.canceled for an in-app intent` (fixture `{ id: "evt_9", type: "payment_intent.canceled", livemode: false, data: { object: { id: "pi_test_9", object: "payment_intent", metadata: { paymentId: "pay-9", jarsoInApp: "1" } } } }`) → `{ kind: "payment", eventId: "evt_9", paymentId: "pay-9", providerRef: "pi_test_9", status: "canceled" }`
  - `ignores payment_intent.canceled without the marker` → `null`
  - `maps setup_intent.succeeded for an in-app setup` (fixture `{ id: "evt_10", type: "setup_intent.succeeded", data: { object: { id: "seti_1", object: "setup_intent", status: "succeeded", payment_method: "pm_1", metadata: { setupId: "set-1", jarsoInApp: "1" } } } }`) → `retrieve` called with `"seti_1"`, result `{ kind: "setup", eventId: "evt_10", setupId: "set-1", methodRef: "pm_1", card: { brand: "visa", last4: "4242" } }`
  - `fails an in-app setup whose intent has no card` (retrieve returns `payment_method: null`) → `{ kind: "setup_failed", setupId: "set-1", reason: "failed" }`
  - `ignores setup_intent.succeeded from a hosted setup` (no marker) → `null`, `retrieve` not called
  - `ignores setup_intent.setup_failed` → `null`
- [ ] **Step 2: Write the failing adapter tests** (`stripe/index.test.ts`, with spies on an injected `Stripe` client):
  - `createInAppPayment` sends the body above with `idempotencyKey: "inapp:pay-1"` and returns the sheet with `publishableKey: "pk_test_X"`
  - with `publishableKey: null`, `inApp` is `false` and `createInAppPayment` rejects `{ code: "UNAVAILABLE" }` without calling `paymentIntents.create`
  - `resumeInAppPayment` on a `requires_payment_method` intent returns its `client_secret` and a new ephemeral key; on `succeeded` it rejects CONFLICT
  - `cancelInAppPayment` swallows `payment_intent_unexpected_state` and rethrows a connection error as UNAVAILABLE
  - `createInAppSetup` sends `usage: "off_session"`, `metadata: { setupId: "set-1", jarsoInApp: "1" }`, `idempotencyKey: "inapp-setup:set-1"`
  - Registry: Stripe is on without `STRIPE_PUBLISHABLE_KEY` (with `inApp` false) and `inApp` true with it.
- [ ] **Step 3: Run them to see them fail.** `pnpm --filter @jarso/web exec vitest run tests/lib/payments`. Expected: FAIL.
- [ ] **Step 4: Implement** the env var, registry line, adapter methods and mapping. Add Stripe to the contract suite's in-app block (mock `paymentIntents.create`, `ephemeralKeys.create`, `setupIntents.create`).
- [ ] **Step 5: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 6: Commit**
```bash
git commit -m "feat(payments): stripe in-app intents and webhook rules"
```

### Task 4: Razorpay in-app orders and `jarsoPay`

**Files:**
- Modify: `apps/web/src/lib/payments/razorpay/index.ts`, `razorpay/map-event.ts`
- Test: `apps/web/tests/lib/payments/razorpay/{index,map-event}.test.ts`, `contract.test.ts` (Razorpay joins the in-app block, INR)

**Interfaces:**
- Produces: `inApp: true`.
  - `createInAppPayment`: `orders.create({ amount, currency: "INR", payment_capture: true, receipt: paymentId, notes: { jarsoPay: paymentId } })` → `{ providerRef: order.id, sheet: { provider: "razorpay", mode: "payment", keyId: opts.keyId, orderId: order.id, amountMinor, currency: "INR", description } }`
  - `resumeInAppPayment`: no API call; the same sheet built from `providerRef`.
  - `cancelInAppPayment`: no-op (orders cannot be cancelled).
  - `createInAppSetup`: same contact check and `customerWithContact` + token order as `createHostedSetup`. Extract them to a private `createSetupOrder(i): Promise<{ orderId: string; customerId: string }>` used by both. Returns `{ providerRef: orderId, sheet: { provider: "razorpay", mode: "setup", keyId, orderId, amountMinor: 100, currency: "INR", description: "Save a card", customerId, prefill: { email: contact.email, contact: contact.phone } } }`. The prefill values are never logged.
- Produces (`mapRazorpayEvent`): in the `order.paid` branch, `note(order.notes, "jarsoCharge") ?? note(order.notes, "jarsoPay")` names the payment. `payment.failed` still reads only `jarsoCharge`, so a failed in-app attempt maps to `null`.

- [ ] **Step 1: Write the failing tests.**
  - `maps order.paid for an in-app order to a succeeded payment`: clone `order-paid-charge.json`, set `payload.order.entity.notes = { jarsoPay: "pay-3" }` → `{ kind: "payment", paymentId: "pay-3", providerRef: <that order's id>, status: "succeeded" }`
  - `ignores payment.failed for an in-app order so the parent can retry`: `payment-failed-charge.json` with `fetched.order = { id: <its order_id>, notes: { jarsoPay: "pay-3" } }` → `null`
  - `ignores jarsoPay on the payment's own notes`: order notes `[]`, payment notes `{ jarsoPay: "pay-3" }` → `null`
  - Adapter: `createInAppPayment` sends exactly `{ amount: 50000, currency: "INR", payment_capture: true, receipt: "pay-1", notes: { jarsoPay: "pay-1" } }` and returns `keyId: "rzp_test_XXXXXXXX"`
  - `createInAppSetup` without contact rejects VALIDATION with `fieldErrors.phone`
  - `createInAppSetup` with contact sends the same token order body as `createHostedSetup` (`notes: { jarsoSetup: "set-1" }`, `method: "card"`, `amount: 100`) and returns `prefill`
  - `resumeInAppPayment` makes no SDK call
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @jarso/web exec vitest run tests/lib/payments/razorpay tests/lib/payments/contract.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 5: Commit**
```bash
git commit -m "feat(payments): razorpay in-app orders with jarsoPay note"
```

### Task 5: In-app payments in the service: start, reuse, switch, expire

**Files:**
- Modify: `apps/web/src/features/payments/server/repository.ts`
- Create: `apps/web/src/features/payments/server/end-payment.ts`
- Modify: `apps/web/src/features/payments/server/service.ts`, `auto-charge.ts`, `server/index.ts`
- Test: `apps/web/tests/features/payments/server/{service,auto-charge,end-payment}.test.ts`

**Interfaces:**
- Consumes: the Task 1 column and the Task 2 contract.
- Produces (repository):
  - `LivePayment` gains `inApp: boolean; providerRef: string | null`. `findLivePayment` selects `in_app, provider_ref`.
  - `insertPayment` input gains `inApp?: boolean` (default false).
  - `setPaymentInApp(admin, paymentId, providerRef): Promise<boolean>` sets `provider_ref`. False on unique violation.
  - `listStaleLivePayments(admin, now): Promise<{ id: string; provider: PaymentProviderId; providerRef: string | null; inApp: boolean }[]>` replaces `listStaleLivePaymentIds`.
- Produces (`end-payment.ts`, `import "server-only"`): `endLivePayment(admin, live: { id; provider; providerRef; inApp }, status: "expired" | "canceled"): Promise<void>`. It calls `expirePayment` / `cancelPayment` first. Then, when `inApp && providerRef` and the provider is on, it calls `provider.cancelInAppPayment(providerRef)`. A throw there is logged (`Could not cancel the in-app payment at the provider`, `{ paymentId, provider }`) and not rethrown.
- Produces (service): `startInAppPayment(input: { kind; id; provider; cashMinor?: number; savedMinor?: number }): Promise<InAppPaymentStart>`.
  - It shares the checks of `startCardPayment`. Extract `prepareCardPayment(input)` returning `{ provider, row, parent, family, source, split }`. It raises the same NOT_FOUND / FORBIDDEN / CONFLICT `notDue` / `giftNotDue` / VALIDATION `fullAmount` / `tooSmall` / `unsupportedCurrency` errors.
  - With no split, it prefills like auto charge: `prefillSplit(row.amountMinor, await getLastSplitWith(db, row.childId))`.
  - Also requires `provider.inApp`, else NOT_FOUND `paymentCopy.off`.
  - Inserts with `inApp: true`, `expiresAt = now + CHECKOUT_MINUTES`.
  - Calls `createInAppPayment`, then `setPaymentInApp`. On a provider throw it cancels the row, as the hosted path does.
- Produces (`reuseLive`): it becomes channel-aware and returns `LiveReuse = { kind: "hosted"; redirectUrl: string } | { kind: "in_app"; paymentId: string; providerRef: string; expiresAt: string } | null`, given `channel: "hosted" | "in_app"`:
  - expired → `endLivePayment(..., "expired")` → null
  - manual, same provider, same channel, with a `redirectUrl` (hosted) or a `providerRef` (in-app) → set the split and return it
  - manual, `pending`, a different provider **or a different channel**, `switchProvider` → `endLivePayment(..., "canceled")` → null
  - anything else → CONFLICT `paymentCopy.inProgress`
  - `startInAppPayment` turns an `in_app` reuse into `InAppPaymentStart` via `resumeInAppPayment`. `startCardPayment` behaves as today for the hosted kind.
- Produces (`runAutoCharges`): the stale sweep calls `endLivePayment(admin, row, "expired")` for each row of `listStaleLivePayments`.

- [ ] **Step 1: Write the failing service tests** (mock repository, registry and `@/lib/supabase/*` as `service.test.ts` does; the fake adapter is real):
  - `starts an in-app payment and returns the provider's sheet`: `insertPayment` called with `objectContaining({ inApp: true, trigger: "manual", status: "pending" })`, `setPaymentInApp` called with `(admin, "pay-1", "fake_pi_pay-1")`, result `{ paymentId: "pay-1", expiresAt: <now+31 min ISO>, sheet: { provider: "fake", mode: "payment", ref: "pay-1" } }`
  - `prefills the split when the phone sends none`: `getLastSplitWith` → `{ cash: 1, saved: 1 }`, amount 1000 → `insertPayment` gets `prefillSplit(1000, …)`'s values
  - `refuses a split that is not the full amount`: VALIDATION `paymentCopy.fullAmount`
  - `refuses a provider that has no in-app sheet`: stub provider with `inApp: false` → NOT_FOUND
  - `reuses the live in-app payment of the same provider`: live `{ inApp: true, providerRef: "fake_pi_old", provider: "fake", status: "pending", trigger: "manual" }` → no insert, `resumeInAppPayment` called with `providerRef: "fake_pi_old"`, returns `paymentId` of the live row
  - `expires a past-window in-app payment, cancels its intent, and starts a new one`: live expired → `expirePayment` then `cancelInAppPayment("fake_pi_old")`, then a new insert
  - `cancels a live hosted checkout when the phone starts in-app` → `cancelPayment(live.id)`, new in-app insert
  - `cancels a live in-app payment, and its intent, when the web starts hosted` → `cancelPayment` + `cancelInAppPayment`, then `createHostedPayment`
  - `answers CONFLICT while an in-app payment is still opening` (live in-app, `providerRef: null`)
  - `sends a parallel tap to the winner's sheet` (insert returns null, second `findLivePayment` gives the winner) → `resumeInAppPayment` on the winner
  - `frees the item when the provider fails to create the intent` → `cancelPayment` called, error rethrown
- [ ] **Step 2: Write the failing `end-payment.test.ts` and `auto-charge.test.ts` tests.**
  - `keeps going when Stripe refuses to cancel an intent that already succeeded`: `cancelInAppPayment` rejects → resolves, `expirePayment` called, `logger.error` called without the raw error
  - `does not call the provider for a hosted payment`
  - Sweep: `expires stale payments and cancels in-app intents` (two stale rows, one in-app) → `cancelInAppPayment` called once
- [ ] **Step 3: Run them to see them fail.** `pnpm --filter @jarso/web exec vitest run tests/features/payments/server`. Expected: FAIL.
- [ ] **Step 4: Implement.** Keep the existing hosted tests green unchanged; they pin `startCardPayment`'s behaviour.
- [ ] **Step 5: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 6: Commit**
```bash
git commit -m "feat(payments): start, reuse and expire in-app payments"
```

### Task 6: In-app status, cancel, card setup, providers and fake completion

**Files:**
- Modify: `apps/web/src/features/payments/server/{repository,service,index}.ts`
- Create: `apps/web/src/features/payments/server/fake-events.ts` (moved `eventFor` from `fake-checkout.ts` as `fakeEventFor(input: { mode; ref; outcome })`. Plain module: a `"use server"` file may export only actions.)
- Modify: `apps/web/src/features/payments/server/fake-checkout.ts` (import `fakeEventFor`)
- Test: `apps/web/tests/features/payments/server/{service,fake-checkout}.test.ts`, new `in-app.test.ts` if `service.test.ts` grows past ~800 lines

**Interfaces:**
- Produces (repository): `findPaymentById(db, id): Promise<{ id; childId; payerId: string | null; provider: PaymentProviderId; providerRef: string | null; status: StoredStatus; failureCode: FailureCode | null; trigger: "manual" | "auto"; inApp: boolean; expiresAt: string | null } | null>`, read with the user client (RLS: the child's parents).
- Produces (service, all parent-only):
  - `getPaymentStatus(paymentId: string): Promise<PaymentStatusView>`
    - `assertRole("parent")`; null row → NOT_FOUND "We couldn't find that."
    - A live in-app row past `expiresAt` is ended as `expired` through `endLivePayment` first (lazy expiry, so a closed sheet reads `expired` without waiting for the hourly sweep)
    - `final = isFinalStatus(status)`
  - `cancelInAppPaymentById(paymentId: string): Promise<{ canceled: boolean }>`
    - NOT_FOUND when payments are off or no row
    - `{ canceled: false }` unless the row is `inApp`, `trigger === "manual"`, `status === "pending"` and `payerId === user.id`
    - else `endLivePayment(..., "canceled")` and `{ canceled: true }`
  - `setAutoChargeInApp(input: AutoChargeTarget & { on: boolean; provider?: PaymentProviderId; phone?: string }): Promise<{ setup: InAppSetupStart | null }>`
    - Same flow as `setAutoCharge`. Extract a private `setAutoChargeWith<T>(input, open: (provider, parent, target) => Promise<T>, none: T)` used by both.
    - The opener is `openInAppSetup(provider, parent, arm, contactInput)`. It mirrors `openSetup` (contact check first, `ensureCustomerRef`, `insertSetup` with `arm`, `createInAppSetup`, `setSetupProviderRef`, `failSetup` on a provider throw).
    - Requires `provider.inApp`.
  - `removeSavedCard` is unchanged (`{ provider }`).
  - `getInAppProviders(item?: { childId: string; kind: "allowance" | "gift"; id: string }): Promise<InAppProviders>`
    - `cards` = `getAutoChargeCard()` filtered to `inApp` providers (`[]` when it returns null)
    - `item` = `getCardPaymentState(childId, source)` with `providers` filtered the same way, or null without `item`
  - `completeFakeInApp(input: FakeInAppCompleteInput): Promise<void>`
    - NOT_FOUND unless the fake provider is on
    - `assertRole("parent")`
    - payment mode: `findPaymentById` must exist with `provider === "fake"` and `payerId === user.id`
    - setup mode: the setup's `parentId === user.id` (via `findSetupForWebhook`'s shape read through the user client)
    - otherwise FORBIDDEN
    - Then `handleProviderEvent("fake", fakeEventFor(input))`

- [ ] **Step 1: Write the failing tests.**
  - `reads a final status`: row `succeeded` → `{ id, status: "succeeded", failureCode: null, final: true }`
  - `expires a past-window in-app payment on read`: row pending, `expiresAt` in the past → `expirePayment` called, result `{ status: "expired", final: true }`
  - `answers NOT_FOUND for a payment the caller cannot read` (row null)
  - `cancels the payer's own pending in-app payment` → `cancelPayment` + `cancelInAppPayment`, `{ canceled: true }`
  - `does not cancel another parent's in-app payment` → `{ canceled: false }`, no repo write
  - `opens an in-app setup with the arm target when no card is saved`: `findCustomer` → no `methodRef` → `insertSetup` with `arm: { type: "allowance_schedule", id }`, result `{ setup: { setupId, sheet: { provider: "fake", mode: "setup" } } }`
  - `turns auto charge on without a setup when a card is saved` → `{ setup: null }`
  - `asks Razorpay's contact before creating anything`: provider `setupNeedsContact`, no phone → VALIDATION `fieldErrors.phone`, `insertSetup` not called
  - `turns auto charge off` → `setAutoChargeFor(…, false, null)`, `{ setup: null }`
  - `lists only in-app providers` (stub provider `inApp: false` filtered out of `cards` and `item.providers`)
  - `completes the payer's fake payment` → `handleProviderEvent("fake", objectContaining({ kind: "payment", paymentId: <ref>, status: "succeeded" }))`
  - `refuses to complete another parent's fake payment` → FORBIDDEN
  - `answers NOT_FOUND when the fake provider is off`
  - The existing `fake-checkout.test.ts` stays green.
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @jarso/web exec vitest run tests/features/payments/server`. Expected: FAIL.
- [ ] **Step 3: Implement.** Export the new service functions from `server/index.ts`.
- [ ] **Step 4: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 5: Commit**
```bash
git commit -m "feat(payments): in-app status, cancel and card setup"
```

### Task 7: Bearer payment routes

Use the `api-endpoint` skill. Every route is `withApi(handler, { bearer: true })`, with the request as the first argument and a Zod-parsed body, params or query. Responses go through `json()`.

**Files (create):**
- `apps/web/src/app/api/v1/payments/in-app/route.ts`: `POST` body `inAppPaymentSchema` → `startInAppPayment` → `InAppPaymentStart`
- `apps/web/src/app/api/v1/payments/[paymentId]/route.ts`: `GET` → `getPaymentStatus` → `PaymentStatusView`
- `apps/web/src/app/api/v1/payments/[paymentId]/cancel/route.ts`: `POST` → `cancelInAppPaymentById` → `{ canceled }`
- `apps/web/src/app/api/v1/payments/auto-charge/route.ts`: `PATCH` body `inAppAutoChargeSchema` → `setAutoChargeInApp` → `{ setup }`
- `apps/web/src/app/api/v1/payments/cards/[provider]/route.ts`: `DELETE`, param `paymentProviderSchema` → `removeSavedCard({ provider })` → `{ removed: true }`. **The spec's `:id` is the provider id.** A parent has at most one card per provider and there is no card id.
- `apps/web/src/app/api/v1/payments/providers/route.ts`: `GET`, query `providersQuerySchema` → `getInAppProviders` → `InAppProviders`
- `apps/web/src/app/api/v1/payments/fake/complete/route.ts`: `POST` body `fakeInAppCompleteSchema` → `completeFakeInApp` → `{ ok: true }` (not in the spec's table, but the fake dialog needs it)
- Each route except fake starts with `await assertRole("parent")` before parsing. Fake checks inside its service.
- Tests: `apps/web/tests/app/api/v1/payments/{in-app,payment-status,cancel,auto-charge,cards,providers,fake-complete}.test.ts` using `fake-bearer-scope.ts`.

**Interfaces:**
- Consumes: Task 5 and 6 service functions.
- Produces: the HTTP contract the phone uses (Task 8). Errors arrive as `{ error: { code, message, details } }`.

- [ ] **Step 1: Write the failing route tests.**
  - `refuses a child token on every payments route`: one `it.each` over the seven routes, with `assertRole` rejecting `FORBIDDEN` → status 403, service not called
  - `answers 401 without a bearer token` (one route suffices: shared scope)
  - in-app: `{ kind: "allowance", id: <uuid>, provider: "stripe" }` → 200 `{ data: <service result> }`; body `{ kind: "allowance" }` → 400 VALIDATION
  - status: a non-uuid id → 400; the service's NOT_FOUND → 404 (`answers 404 for a payment the caller cannot read`)
  - cancel: 200 `{ data: { canceled: true } }`
  - auto-charge: `{ type: "parent_gift", id, on: true, provider: "razorpay", phone: "+91 98765 43210" }` passes `phone` through; `{ on: true }` without provider → 400
  - cards: `DELETE /payments/cards/paypal` → 400; `/payments/cards/stripe` → `removeSavedCard({ provider: "stripe" })`
  - providers: no query → `getInAppProviders(undefined)`; full query → item passed; partial query → 400
  - fake complete: 404 when the service says NOT_FOUND
  - Non-GET requests with a foreign `Origin` and a bearer token behave as the existing bearer routes do (assert the same status as `learning/start/route.test.ts` does).
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @jarso/web exec vitest run tests/app/api/v1/payments`. Expected: FAIL.
- [ ] **Step 3: Implement the seven routes.**
- [ ] **Step 4: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 5: Run the `security-auditor` agent** on the route set and Tasks 5–6 (spec §3 requires it). Fix blocking findings in this task.
- [ ] **Step 6: Commit**
```bash
git commit -m "feat(api): bearer routes for phone card payments"
```

### Task 8: Phone payments plumbing: deps, config plugin, API calls, hooks

**Files:**
- Modify: `apps/mobile/package.json` (`npx expo install @stripe/stripe-react-native` (Expo SDK 58's pinned version); `pnpm add react-native-razorpay` (exact pin))
- Modify: `apps/mobile/app.json` plugins: add `["@stripe/stripe-react-native", { "enableGooglePay": false }]`. Plan 3 adds `expo-dev-client` and `expo-notifications`; keep both. `react-native-razorpay` autolinks and needs no plugin.
- Modify: `apps/mobile/src/lib/query.ts` keys:
  - `paymentProviders: (item?: string) => ["payments", "providers", item ?? "all"]`
  - `paymentStatus: (id: string) => ["payments", "status", id]`
  - `autoCharge: (type: string, id: string) => ["payments", "autoCharge", type, id]`
- Create: `packages/data/src/payments/{auto-charge,index}.ts`, `packages/data/package.json` export `"./payments"`
- Create: `apps/mobile/src/features/payments/{api,use-payment-providers,use-auto-charge-state,index}.ts`
- Test: `packages/data/tests/payments/auto-charge.test.ts`, `apps/mobile/tests/features/payments/api.test.ts`

**Interfaces:**
- Produces (`@jarso/data/payments`): `fetchAutoChargeState(db: Client, target: AutoChargeTarget, today: string): Promise<{ on: boolean; provider: PaymentProviderId | null; by: string | null; overdue: boolean }>`
  - schedule: `rpc("allowance_schedule_auto_charge", { p_schedule_id })`, `overdue: false`
  - gift: `parent_gifts` select `give_on, auto_charge, auto_charge_provider, auto_charge_by`; `overdue = !on && give_on < today`
  - An unknown provider string throws INTERNAL. If plan 2 already moved `fetchScheduleAutoCharge` / `findGift` into `@jarso/data/allowance`, call those instead of repeating the queries.
- Produces (mobile `api.ts`), each via `apiFetch(…, { auth: true })`:
  - `startInAppPayment(body: { kind; id; provider; cashMinor?; savedMinor? }): Promise<InAppPaymentStart>`
  - `getPaymentStatus(paymentId): Promise<PaymentStatusView>`
  - `cancelInAppPayment(paymentId): Promise<{ canceled: boolean }>`
  - `setAutoCharge(body: { type; id; on; provider?; phone? }): Promise<{ setup: InAppSetupStart | null }>` (PATCH)
  - `removeCard(provider): Promise<void>` (DELETE)
  - `getPaymentProviders(item?: { childId; kind; id }): Promise<InAppProviders>`
  - `completeFakeSheet(body: FakeInAppCompleteInput): Promise<void>`
- Produces (hooks):
  - `usePaymentProviders(item?)`: `useQuery`, key `keys.paymentProviders(item && \`${item.kind}:${item.id}\`)`
  - `useAutoChargeState(target: { kind: "schedule" | "gift"; id: string })`: maps `kind` to `allowance_schedule | parent_gift`, reads today from `@jarso/data/family` `getFamilyContext`

- [ ] **Step 1: Write the failing tests.**
  - data:
    - `reads a schedule's auto charge through the rpc`: fake client records `rpc("allowance_schedule_auto_charge", { p_schedule_id: "s1" })`, result `{ on: true, provider: "stripe", by: "p1", overdue: false }`
    - `marks an off gift past its day as overdue`: today `"2026-11-03"`, `give_on: "2026-11-02"` → `overdue: true`
    - `an on gift past its day is not overdue`
  - mobile api:
    - `startInAppPayment` posts to `/api/v1/payments/in-app` with `auth: true` and the body
    - `removeCard("stripe")` calls `DELETE /api/v1/payments/cards/stripe`
    - `getPaymentProviders({ childId: "c", kind: "gift", id: "g" })` calls `/api/v1/payments/providers?childId=c&kind=gift&id=g`
    - Mock `fetch` as `tests/api.test.ts` does.
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @jarso/data test`, `pnpm --filter @jarso/mobile test -- payments`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add jest mocks for `@stripe/stripe-react-native` and `react-native-razorpay` to `apps/mobile/tests/setup.ts`, so later component tests can render.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Check the native build.** Run `npx expo prebuild --platform android --no-install --clean` in a scratch copy, or `npx expo config --type prebuild`. Expected: the Stripe plugin resolves. Then `pnpm check` green.
- [ ] **Step 6: Commit**
```bash
git commit -m "feat(mobile): payments api client and native sdks"
```

### Task 9: Native sheets and status polling

**Files:**
- Create: `apps/mobile/src/features/payments/sheets/{stripe,razorpay,index}.ts`, `sheets/fake-sheet.tsx`, `use-payment-status.ts`
- Test: `apps/mobile/tests/features/payments/{sheets,use-payment-status}.test.tsx`

**Interfaces:**
- Produces: `type SheetOutcome = "completed" | "closed"`. "completed" means the sheet says it finished; it is never shown as paid.
- Produces: `presentSheet(sheet: InAppSheet, opts: { onFake: (sheet) => Promise<SheetOutcome> }): Promise<SheetOutcome>`
  - **Stripe** (`presentStripeSheet`):
    - `initStripe({ publishableKey: sheet.publishableKey, urlScheme: "jarso" })`
    - `initPaymentSheet({ merchantDisplayName: "Jarso", customerId, customerEphemeralKeySecret: ephemeralKey, paymentIntentClientSecret | setupIntentClientSecret: clientSecret, returnURL: "jarso://stripe-redirect", allowsDelayedPaymentMethods: false })`
    - `presentPaymentSheet()`: no error → "completed"; any error (`Canceled`, `Failed`) → "closed". A Failed inside the sheet is a retryable decline; the payment stays pending.
    - An `initPaymentSheet` error → throw `AppError("UNAVAILABLE", paymentCopy.cardFormFailed)`.
  - **Razorpay** (`presentRazorpaySheet`): `RazorpayCheckout.open({ key: keyId, order_id: orderId, amount: amountMinor, currency, name: "Jarso", description, method: { card: true, netbanking: false, upi: false, wallet: false, emi: false, paylater: false }, ...(mode === "setup" ? { customer_id: customerId, recurring: "1", prefill } : {}) })`. Resolve → "completed"; reject → "closed". The signature in the result is ignored (spec: no client-side verification).
  - **Fake**: `<FakeSheet>` dialog, rendered only when `__DEV__`. Payment buttons `paymentCopy.fakePay` / `fakeDecline`, setup buttons `fakeSaveOk` / `fakeSaveDecline`, and `paymentCopy.goBack`. A choice calls `completeFakeSheet({ mode, ref, outcome })` → "completed"; Go back → "closed". Outside `__DEV__`, `presentSheet` throws UNAVAILABLE `paymentCopy.cardFormFailed` for a fake sheet.
- Produces: `usePaymentStatus(paymentId: string | null): { view: PaymentStatusView | null; stillConfirming: boolean }`
  - polls `getPaymentStatus` every 2 s
  - after 15 s without a final status, `stillConfirming` becomes true and the interval goes to 5 s
  - stops on `final` or after 2 min
  - a rejected read keeps the last view and keeps polling
  - on a final status it calls `queryClient.invalidateQueries({ refetchType: "active" })`, so the handover, hub and history screens of plan 2 refresh without knowing their keys

- [ ] **Step 1: Write the failing tests** (jest fake timers; SDKs mocked in setup):
  - `opens PaymentSheet with the API's params`:
    - `initStripe` called with `{ publishableKey: "pk_test_X", urlScheme: "jarso" }`
    - `initPaymentSheet` called with `objectContaining({ customerId: "cus_1", customerEphemeralKeySecret: "ek_1", paymentIntentClientSecret: "pi_1_secret_x", returnURL: "jarso://stripe-redirect" })`
    - outcome "completed"
  - `uses the setup intent secret for a setup sheet` → `setupIntentClientSecret: "seti_1_secret_x"`
  - `treats a Canceled sheet as closed`
  - `opens Razorpay card-only with the order id` → `open` called with `objectContaining({ key: "rzp_test_XXXXXXXX", order_id: "order_1", method: objectContaining({ card: true, upi: false }) })`
  - `adds recurring and prefill for a Razorpay setup`
  - `treats a dismissed Razorpay checkout as closed`
  - `refuses a fake sheet outside dev builds`
  - `stops polling at a final status and refreshes active queries`
  - `shows still confirming after 15 seconds of pending`
  - `keeps polling after a failed status read` (first call rejects UNAVAILABLE, second resolves `succeeded`)
- [ ] **Step 2: Run them to see them fail.** `pnpm --filter @jarso/mobile test -- payments`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 5: Commit**
```bash
git commit -m "feat(mobile): native payment sheets and status polling"
```

### Task 10: `CardPaymentSlot` on the handover screen

**Files:**
- Modify: `apps/mobile/src/features/payments/card-payment-slot.tsx` (plan 2's empty component), `index.ts`
- Test: `apps/mobile/tests/features/payments/card-payment-slot.test.tsx`

**Interfaces:**
- Consumes: plan 2's contract `<CardPaymentSlot kind id childId amountMinor currency />`, Tasks 8–9.
- Produces: one extra **optional** prop, `split?: { cashMinor: number; savedMinor: number } | null`. When given and summing to `amountMinor`, it is sent; when absent, the server prefills. Plan 2 should pass its form's split if the handover form has one (see the report).
- Behaviour mirrors web `pay-by-card.tsx` and `payment-status-note.tsx`:
  - Renders nothing when `usePaymentProviders(item).data.item.providers` is empty.
  - Buttons: one per available provider, `paymentCopy.payByCard` with one and `payWith(label)` with several. With none available, one disabled button showing `tooSmall` / `unsupportedCurrency`.
  - Shows `paymentCopy.testMode` small and muted.
  - Tap → `startInAppPayment` → `presentSheet` → `usePaymentStatus(paymentId)`:
    - while polling: `confirming`
    - `stillConfirming`: `stillConfirming`
    - `succeeded`: `received`
    - `succeeded_unapplied`: `unapplied`
    - `failed`: `failedTitle` + `failureCopy[code]`
    - `expired` / `canceled`: back to the buttons
  - "closed" with the payment still pending: `pendingTitle` + `pendingDetail`, plus **Pay again** (same provider, so the server reuses the intent) and **Cancel card payment** (`cancelInAppPayment`, toast `cancelled`).
  - On mount with `item.pending` (another session left one open): the same pending block. Pay again uses `item.pending.provider`.
  - Errors show the AppError message (`inProgress`, `notDue`, …) in the form-error style.
  - Buttons are disabled while a request is in flight. Labels and roles are set, 48 dp targets, type tokens `text-body-parent` / `text-small`.

- [ ] **Step 1: Write the failing tests** (mock `api.ts`, `sheets/index.ts`):
  - `renders nothing when card payments are off`
  - `shows Pay with Stripe and Pay with Razorpay when both are on`
  - `opens the sheet and never posts success`: after "completed", the only POST was `startInAppPayment`; status `succeeded` → text `paymentCopy.received`
  - `shows the pending block with Pay again after the sheet is closed`; pressing Pay again calls `startInAppPayment` with the same provider
  - `cancels the live payment` → `cancelInAppPayment("p1")`, then `paymentCopy.cancelled`
  - `shows the live payment on reopen and Pay again reuses it` (`item.pending = { provider: "stripe", redirectUrl: null }`)
  - `shows the decline reason when the payment failed` (`failureCode: "insufficient_funds"` → `failureCopy.insufficient_funds`)
  - `sends the split when the form has one` → body has `cashMinor: 300, savedMinor: 200`
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 5: Commit**
```bash
git commit -m "feat(mobile): pay a handover by card in the native sheet"
```

### Task 11: `AutoChargeSlot` and saved cards

**Files:**
- Modify: `apps/mobile/src/features/payments/auto-charge-slot.tsx` (plan 2's empty component)
- Create: `apps/mobile/src/features/payments/saved-cards.tsx` (`<SavedCardsSlot />`), `index.ts` export
- Modify: plan 2's parent settings screen (expected `apps/mobile/app/(parent)/settings.tsx`) to render `<SavedCardsSlot />` under a `paymentCopy.savedCardTitle(cards)` heading. This is the web's settings placement; plan 2 has no slot for it.
- Test: `apps/mobile/tests/features/payments/{auto-charge-slot,saved-cards}.test.tsx`

**Interfaces:**
- Consumes: plan 2's `<AutoChargeSlot target={{ kind: "schedule" | "gift"; id }} />`, `useAutoChargeState`, `usePaymentProviders()`, `setAutoCharge`, `removeCard`, `presentSheet`.
- Behaviour mirrors web `auto-charge-toggle.tsx` and `saved-card-panel.tsx`:
  - No in-app providers → nothing.
  - Overdue gift or no usable provider while off → the `autoChargeOverdue` / `unsupportedCurrency` card.
  - Switch labelled `paymentCopy.autoCharge`, detail `autoChargeAllowance` / `autoChargeGift`. While on, it names the card (`charges(cardEnding)` when `mine`, else `chargesOther(label)`).
  - Turning on:
    - exactly one usable saved card → PATCH with it
    - several saved → `chooseCardTitle` sheet
    - none saved → `saveCardTitle` sheet with `mandate`, a provider choice (`saveWith(label)`) when several, and `phoneLabel` / `phoneHelp` input when `needsPhone`
    - the PATCH returns `setup` → `presentSheet(setup.sheet)`
    - after "completed", refetch the state every 2 s for up to 20 s until `on` is true; otherwise show `autoChargeLater`
    - VALIDATION `fieldErrors.phone` shows under the phone field
  - Turning off → PATCH `{ on: false }`.
  - `SavedCardsSlot`: per provider, `cardEnding(brand, last4)` + `removeCard` behind a `removeTitle` / `removeDetail` confirm, toast `removed`, else `noCard`.

- [ ] **Step 1: Write the failing tests.**
  - `turns on with the single saved card` → PATCH `{ type: "allowance_schedule", id: "s1", on: true, provider: "stripe" }`, no sheet
  - `asks for the mobile number before saving with Razorpay` → PATCH body has `phone: "+919876543210"`, then `presentSheet` with the returned setup sheet
  - `shows the phone error from the server under the field`
  - `shows Once it's saved when the card has not arrived after the sheet` (state stays off for 20 s) → `paymentCopy.autoChargeLater`
  - `turns off` → PATCH `{ on: false }`
  - `shows the overdue note for a gift past its day`
  - `removes a card after confirming` → `removeCard("razorpay")`, toast `paymentCopy.removed`
- [ ] **Step 2: Run them to see them fail.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests again.** Expected: PASS. `pnpm check` green.
- [ ] **Step 5: Commit**
```bash
git commit -m "feat(mobile): auto charge and saved cards on the phone"
```

### Task 12: Maestro card flows, device check and docs

**Files:**
- Create in `apps/mobile/e2e/`:
  - `card-handover-fake.yaml`: parent sign-in (`runFlow: parent-sign-in.yaml` from plan 2), open the due allowance's handover, Pay by card, fake dialog Pay, assert `Payment received.`, then the child history line `Paid by card` via the web-parity child flow
  - `card-handover-stripe.yaml`: card `4242 4242 4242 4242`, any future expiry, CVC `123` → `Payment received.`
  - `card-handover-stripe-3ds.yaml`: card `4000 0027 6000 3184`, complete the test 3DS page → `Payment received.`
  - `card-close-early.yaml`: open the Stripe sheet, close it → `Card payment in progress`, Cancel card payment → `Card payment cancelled.`
  - `save-card.yaml`: auto charge on, Stripe setup sheet with 4242 → switch shows on
  - `card-handover-razorpay.yaml` and `save-card-razorpay.yaml`: INR family, a test card from Razorpay's docs, OTP page Success
  - Flows that need real keys start with a comment: "Needs Stripe/Razorpay test keys on the web server". Credentials go in as `-e PARENT_EMAIL=… -e PARENT_PASSWORD=…` from the shell.
- Modify docs:
  - `docs/mobile.md`: a Payments section covering the sheets, poll, fake dialog in dev builds, no `EXPO_PUBLIC` key, and the flows list
  - `docs/api.md`: the seven routes with request/response types
  - `docs/testing.md`: new unit test files, the Maestro flows and their env
  - `docs/security.md`: a `STRIPE_PUBLISHABLE_KEY` row ("public by design; reaches the phone only in the `/payments/in-app` response"); the phone never verifies signatures
  - `docs/deploy.md`: add `payment_intent.canceled` and `setup_intent.succeeded` to the Stripe webhook events; `STRIPE_PUBLISHABLE_KEY`; a device checklist item
  - `docs/adr/<next>-native-payment-sheets.md` from `0000-template.md`, plus `docs/adr/README.md`: the in-app channel, `jarsoInApp` / `jarsoPay` rules, the `in_app` flag instead of stored client secrets, expiry cancels the intent
- Modify `tasks/todo.md` device checklist: Stripe 3DS return to app via `jarso://stripe-redirect`, Razorpay recurring on the test account, the ephemeral key API version is accepted by the SDK.

- [ ] **Step 1: Write the flows** using the labels the slots expose (core copy).
- [ ] **Step 2: Run them on a dev build.**
  - Build with `eas build --profile development --platform android` (plan 3) or `npx expo run:android`.
  - Run `pnpm dev` with `PAYMENTS_ALLOW_FAKE=true`, then `maestro test -e PARENT_EMAIL=… -e PARENT_PASSWORD=… apps/mobile/e2e/card-handover-fake.yaml apps/mobile/e2e/card-close-early.yaml`.
  - With Stripe test keys and `stripe listen` forwarding to the laptop, run the Stripe flows. With Razorpay keys and a tunnel, run the Razorpay flows.
  - Expected: all pass. The child's phone and the web show "Paid by card"; ledger rows match a cash handover (check the history screen).
  - Record anything not run in `tasks/todo.md`; do not claim it passed.
- [ ] **Step 3: Write the docs and the ADR.** Run `pnpm check` (green). Run `scripts/check-secrets.sh` on the staged diff: no key-shaped strings, placeholders only.
- [ ] **Step 4: Commit** (two commits)
```bash
git add apps/mobile/e2e tasks/todo.md && git commit -m "test(mobile): maestro card payment flows"
git add docs && git commit -m "docs: native card payments on the phone"
```

---

## Self-review notes

- Spec §4 coverage:
  - contract → T2–4
  - `jarsoInApp` rules and `setup_intent.succeeded` → T3
  - `jarsoPay` → T4
  - stored sheet params / `reuseLive` → T1, T5 (flag + re-derive, see Task 1)
  - expiry/cancel cancels the intent → T5, T6
  - poll, "still confirming", never post success → T9, T10
  - fake dialog → T2, T6, T9
- §3 routes → T7. Done-when card items → T12.
- Types used across tasks: `InAppSheet`, `InAppPaymentStart`, `InAppSetupStart`, `PaymentStatusView`, `InAppProviders`, `endLivePayment`, `LiveReuse`, `SheetOutcome`.
