# Card handover through a payment provider (Stripe, test mode) — design

Status: draft for approval · 2026-10-31

## 1. Intent

Show real payment rails in the demo. A parent pays a due allowance or one-time gift by card, and the money lands in the child's Spend and Save jars. The first provider is **Stripe, in test mode only**: Stripe's real hosted Checkout, real webhooks, test cards, no real money moves.

**The design is provider-agnostic.** Jarso's domain code (handover, ledger, auto charge, UI) talks to a `PaymentProvider` interface, never to Stripe. Adding a second provider (Razorpay, Adyen, Mollie, PayPal…) means writing one adapter and registering it. No migration, no change to the domain code, and no new route.

`REQUIREMENTS.md` keeps real payments out of the pilot. This slice doesn't change that: it is a test-mode showcase behind configuration, and the deployment is non-production today.

## 2. Goals

1. **Pay by card**, a second way to hand over, next to the existing cash handover, for due allowances and due one-time gifts. Cash handover is unchanged.
2. **Auto charge**: a per-schedule toggle (allowance) and a per-gift toggle (gift). When an item falls due, Jarso charges the parent's saved card and posts the handover.
3. With auto charge on, the parent can still tap Pay by card or hand over cash. Whichever posts first wins.
4. Each due item posts to the ledger once, whatever the retries, clicks or races.
5. **Swappable providers**: everything provider-specific sits behind one interface and one adapter folder.

## 3. Non-goals

- Live mode or real money anywhere.
- Paying out to the child, or any child-facing payment UI.
- Refunds, disputes, partial card payments, subscriptions, marketplaces/Connect, more than one saved card per parent, and card payment for savings requests or emergency funds.
- Running two providers at once for one deployment. The interface allows it later (rows carry `provider`), but this slice picks one active provider per deployment.

## 4. Anti-goals (a failure even if it works)

- Money posts twice: from a webhook retry, a duplicate event, a double click, auto charge racing a manual payment, or two overlapping cron runs.
- A card number or CVC reaches Jarso. Only provider references, card brand and last 4 are stored.
- A key or webhook secret lands in the repo, logs or `.claude-logs/` (`docs/security.md`).
- The child sees card details, payment state or a failed charge.
- Cash handover breaks, or a due item gets stuck, when the provider is down or payments are switched off.
- Stripe types, IDs or concepts leak outside `src/lib/payments/stripe/`, apart from opaque `*_ref` strings.

## 5. Decided with the product owner

- The parent pays, and the money lands in the child's jars. Test mode is enough.
- Card is a **second option**. Cash handover stays.
- **Auto charge is a toggle**, and Pay by card is always available as well.
- All of this applies to one-time gifts too.
- **One deployment-wide switch** turns payments on. No per-family gate: the deployment is non-production.
- The design must make **a second provider easy to add**.

## 6. Architecture

### 6.1 Module layout

Provider code is infrastructure, so it lives in `src/lib/payments/` (product owner, 2026-10-31). It is a server-only entry point like `@/lib/api`, imported directly as `@/lib/payments` and not re-exported from `@/lib`. It knows nothing about allowances, gifts or the ledger. The domain lives in the feature module.

```
src/lib/payments/           # provider layer: no domain, no database
  index.ts                  # "server-only" barrel: types, getPaymentProvider, paymentProviderName
  types.ts                  # PaymentProvider interface, ProviderEvent, PaymentStatus, FailureCode
  registry.ts               # providerId → factory; selects from PAYMENTS_PROVIDER
  stripe/                   # adapter.ts, map-event.ts, currencies.ts, *.test.ts, fixtures/
  fake/                     # in-memory provider for tests and local dev without Stripe
  contract.test.ts          # shared adapter contract suite, run against every adapter

src/features/payments/      # domain: handover by card, auto charge
  index.ts                  # client-safe: types, status labels, schemas
  types.ts · schemas.ts
  components/               # PayByCardButton, AutoChargeToggle, SavedCardPanel, PaymentStatusNote
  server/
    index.ts                # "server-only" barrel
    actions.ts              # startCardPayment, startCardSetup, setAutoCharge, removeCard
    service.ts              # domain logic: talks to @/lib/payments + repository
    repository.ts           # the only file that knows table/column names
    webhooks.ts             # handleProviderEvent(normalized event) → state machine
    auto-charge.ts          # runAutoCharges(now): selection + charge + record
```

Routes stay thin:
- `POST /api/v1/payments/webhooks/[provider]`: looks up the provider in the registry (404 if it's unknown or not active), passes the raw body and headers to `provider.parseWebhook`, then calls `handleProviderEvent`.
- `GET|POST /api/cron/payments/auto-charge`: secret-header auth, then calls `runAutoCharges`.

Same pattern as the guide (`guide/server/provider.ts`, `getGuideProvider()`, fake provider in tests).

### 6.2 The provider interface

```ts
type ProviderId = "stripe" | "fake";              // union grows with each adapter
type PaymentStatus = "pending" | "requires_action" | "succeeded" | "failed" | "canceled" | "expired";

interface PaymentProvider {
  readonly id: ProviderId;
  minimumChargeMinor(currency: string): number | null;   // null = currency unsupported
  ensureCustomer(i: { parentId: string; email: string }): Promise<{ customerRef: string }>;
  createHostedPayment(i: {
    paymentId: string; amountMinor: number; currency: string; customerRef: string;
    description: string; successUrl: string; cancelUrl: string; expiresAt: Date;
  }): Promise<{ redirectUrl: string; providerRef: string }>;
  createHostedSetup(i: {
    setupId: string; customerRef: string; successUrl: string; cancelUrl: string;
  }): Promise<{ redirectUrl: string; providerRef: string }>;
  chargeSaved(i: {
    paymentId: string; amountMinor: number; currency: string;
    customerRef: string; methodRef: string; description: string;
  }): Promise<{ providerRef: string; status: PaymentStatus; failureCode?: FailureCode }>;
  detachMethod(methodRef: string): Promise<void>;
  parseWebhook(rawBody: string, headers: Headers): Promise<ProviderEvent | null>; // verify + map; null = ignore
}

type FailureCode = "declined" | "insufficient_funds" | "authentication_required" | "expired_card" | "other";

type ProviderEvent =
  | { kind: "payment"; eventId: string; paymentId: string; providerRef: string; status: PaymentStatus; failureCode?: FailureCode }
  | { kind: "setup"; eventId: string; setupId: string; methodRef: string; card: { brand: string; last4: string } }
  | { kind: "setup_failed"; eventId: string; setupId: string };
```

Rules:
- **Our IDs go out, provider IDs come back.** Every call carries our own `paymentId`/`setupId`. The adapter puts it where its provider echoes it back (for Stripe, `client_reference_id` and `metadata`) and uses it as the idempotency key. Domain code never parses provider payloads.
- **The adapter owns** signature checks, rejecting live/production events, currency rules, error-code mapping and API version pinning. Anything it can't map comes back as `null` (ignored, logged at debug) or as `failureCode: "other"`.
- Adapters never throw raw SDK errors. They throw `AppError("UNAVAILABLE", safeMessage, { cause })` (signature or live-mode problems: `VALIDATION`).
- `registry.ts` selects the active provider from `PAYMENTS_PROVIDER` (`none` | `stripe` | `fake`). `none`, the default, means payments are off: nothing renders, the routes return 404, and cash works as today. Adding a provider = add a folder, add one registry line, add its env vars.

### 6.3 Data (one migration, RLS on every table)

All tables are provider-neutral and carry a `provider` column.

- **`payment_customers`**: `(parent_id, provider)` PK, `customer_ref`, `method_ref` (nullable), `card_brand`, `card_last4`, `updated_at`. RLS: the parent reads their own rows. Writes go through the service role / definer functions only.
- **`payment_setups`**: id, parent_id, provider, provider_ref, `status` (`pending` | `succeeded` | `failed` | `expired`), timestamps. Tracks a save-card session so the webhook knows which parent it belongs to. Parent reads their own.
- **`payments`**: id, family_id, child_id, payer_id, provider, provider_ref, `source_type` (`occurrence` | `parent_gift`), source_id, amount_minor, currency, cash_minor, saved_minor, `trigger` (`manual` | `auto`), `status` (`PaymentStatus` plus `succeeded_unapplied`), failure_code, expires_at, timestamps. RLS: the child's parents read. Writes go through the service role only.
  - Partial unique index: one row per source where status ∈ (`pending`, `requires_action`, `succeeded`).
  - Partial unique index: one `auto` row per source, ever (§6.6).
- **`payment_webhook_events`**: `(provider, event_id)` PK, received_at. Service role only.
- **Toggles:** `auto_charge boolean default false`, `auto_charge_by uuid`, `auto_charge_since timestamptz` on `allowance_schedules` and `parent_gifts`.
- **Ledger:** `ledger_entries.method text not null default 'cash' check (method in ('cash','card'))`. This is the only ledger change. The child's history already reads the ledger, so "paid by card" shows without the child reading `parent_gifts` or `payments`, and gift notes stay as labels.
- **Notification kind:** `card_charge_failed` (parent only).

### 6.4 Posting to the ledger

New definer functions, executable by `service_role` only:
- `apply_payment(p_payment_id uuid)`, which branches on `source_type` (occurrence or gift)

Each one:
1. Locks the payment row, then the source row, then the child's ledger advisory lock. This is the same order as `confirm_handover` / `confirm_gift_handover`, so a cash and a card post serialise.
2. If the source is already `confirmed` / `given`, it sets the payment to `succeeded_unapplied` and returns `already_confirmed`. If the source is `closed` / `cancelled`, it also sets `succeeded_unapplied` and returns `not_given` / `cancelled`.
3. Otherwise it writes the ledger rows with the existing keys (`occurrence:<id>:spend|save`, `parent_gift:<id>:spend|save`) and `method = 'card'`, marks the source confirmed with `confirmed_by` / `given_by` = the payment's `payer_id`, and sets the payment to `succeeded`.

The provider never posts directly. Posting is idempotent through the payment row's status, the ledger's unique idempotency keys, and the source row's status.

### 6.5 Flows

**Pay by card (manual)**
1. On the handover screen, the parent sets the split and taps Pay by card. Card always pays the item's **full amount**, with no shortfall (*my call*).
2. `startCardPayment`:
   - `assertUser`; checks the parent's access and that the item is due.
   - Checks the minimum charge: below `minimumChargeMinor`, the button is disabled with "Too small to pay by card".
   - Reuses a `pending` payment for the source if one hasn't expired; otherwise inserts one with `expires_at = now + 31 min`.
   - Calls `ensureCustomer` and `createHostedPayment`, then redirects.
3. Return URL: the handover screen shows "Payment received, updating the jars…". The success redirect never posts money.
4. The webhook maps the event to `payment` / `succeeded`, then `handleProviderEvent` → §6.4.

**Save a card**
1. Switching auto charge on with no saved card runs `startCardSetup`, which creates a `payment_setups` row and calls `createHostedSetup`.
2. The webhook `setup` event stores `method_ref`, brand and last 4 on `payment_customers`, then turns on the toggle the parent asked for (carried through the setup row).
3. Before redirecting, the parent sees **mandate copy**: "Jarso will charge this card the allowance or gift amount on the day it's due, until you turn auto charge off." Required for off-session charges to UK/EU cards.
4. Remove card: `detachMethod`, clear `method_ref`, and turn off every toggle that parent set.

**Auto charge**
1. A toggle on sets `auto_charge_since = now()`. Only items that fall due **after** that moment qualify. Turning it on never back-charges overdue items.
2. `runAutoCharges(now)` selects items where all of these hold:
   - the item is due;
   - `auto_charge` is on;
   - the due date ≥ `auto_charge_since`;
   - the payer still has a saved card for the active provider;
   - the item has **no `auto` payment row of any status**;
   - there is no live `pending` / `requires_action` / `succeeded` row.

   For each, it claims the item by inserting a payment (`trigger = auto`) with the split taken from the last handover for that child's allowance (else all to Spend), then calls `chargeSaved`. A unique violation on the one-`auto`-row index means another run claimed it: skip (overlapping runs are safe).
3. On success: posting is driven by the webhook (synchronous success is recorded, but the webhook remains the source of truth; posting twice is harmless by §6.4).
4. On failure (`declined`, `insufficient_funds`, `authentication_required`, `expired_card`): the payment becomes `failed`, the item stays due, and the payer gets `card_charge_failed` with a link to the handover screen. **One automatic attempt per item.** Saving a new card doesn't retry it; the parent pays by card or in cash (*my call*).

### 6.6 Races

| Race | Outcome |
| --- | --- |
| Double click / two tabs on Pay by card | The second click reuses the live pending payment (same Checkout URL), with its split updated to the second click's (the split never goes to the provider). The unique index backs this up. |
| Parent backs out of Checkout | The `?card=cancelled` return cancels that parent's live manual pending payment for the item (`fail_payment … canceled`, from the client after render), so the item isn't shown as in progress. A late success still posts: `apply_payment` accepts it from `canceled`. |
| Auto charge vs. a manual card payment in progress | Auto skips sources with a live pending row. |
| Cash vs. card | The first to take the source lock posts. The later card payment becomes `succeeded_unapplied`, and the parent sees "Paid by card after it was already handed over. Refund it from the provider's dashboard" (test mode: no real money). |
| Duplicate or replayed webhook | `payment_webhook_events` PK is a no-op; the status machine only moves forward. |
| Out-of-order webhooks | The status machine ignores backward moves (for example `expired` after `succeeded`). |
| Overlapping cron runs | Claim by insert against the one-`auto`-row-per-source unique index. |

While a payment is pending, the cash handover screen shows "Card payment in progress" but still allows cash. Editing or cancelling a gift, and marking an allowance not given, are blocked while a payment is pending (*my call*).

### 6.7 Scheduling

Vercel Hobby only allows daily crons, and `docs/architecture.md` has pg_cron own every schedule.
- **Primary:** a pg_cron job, hourly at :09 (after `generate-due-occurrences` at :05 and reminders at :07), calls the route through `pg_net` with the cron secret read from **Supabase Vault**. The migration creates the job only when the Vault secret and app URL exist, so local runs and CI don't break.
- **Fallback:** a daily Vercel Cron on the same route (`Authorization: Bearer CRON_SECRET`, GET).
- The route is reconciliation-style (everything due and unclaimed), so a missed or doubled run is harmless.

### 6.8 What each role sees

- **Parent:** Pay by card on the handover screen; an auto-charge toggle on the allowance schedule and the gift form; a saved-card panel in settings (brand, last 4, Remove); the payment state on the handover screen; the `card_charge_failed` notice.
- **Child:** nothing new apart from "paid by card" on the history line, from `ledger_entries.method`.

## 7. Stripe adapter (first provider)

Facts checked 2026-10-31 against `stripe@23.1.0` and docs.stripe.com.

- **SDK:** `stripe` 23.x, server only. `new Stripe(key, { apiVersion: "2026-10-28.endive" })`. Lock the package major version, and set the webhook endpoint's API version to match.
- **Hosted payment:** a Checkout Session with `mode: "payment"`, `customer`, `client_reference_id = paymentId`, `metadata.paymentId`, `expires_at` = the payment's `expires_at`, now + 31 min (Stripe's minimum is 30 min from when it receives the request, so one minute covers the round trips), and idempotency key `pay:<paymentId>`.
- **Hosted setup:** a Checkout Session with `mode: "setup"`, `customer` (always create the Customer first), `client_reference_id = setupId`, `setup_intent_data.metadata.setupId`. On completion, expand `setup_intent.payment_method` for the ID, brand and last 4.
- **Off-session charge:** `paymentIntents.create({ amount, currency, customer, payment_method, off_session: true, confirm: true, metadata: { paymentId } }, { idempotencyKey: "charge:<paymentId>" })`. A failure comes back as HTTP 402: map `last_payment_error.code` / `decline_code` to `FailureCode`. `authentication_required` → `failed` + notice; the parent then pays on-session.
  - Idempotency keys are pruned after about 24h, so keys are derived from our payment row, and a retry is a new row by design, never a reused key.
- **Webhook:**
  - Node runtime; `await req.text()` for the raw body; `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`. Reject `event.livemode === true`.
  - Return 2xx fast. Our handling is one DB transaction.
  - Test-mode retries are 3 times over a few hours. Ordering isn't guaranteed, and duplicates can arrive under different event IDs, so the business-key status machine matters, not just event-ID dedupe.
- **Events mapped:**

  | Stripe event | Maps to |
  | --- | --- |
  | `checkout.session.completed` (payment mode, `payment_status = paid`) | `payment` / `succeeded` |
  | `checkout.session.async_payment_succeeded` / `checkout.session.async_payment_failed` | `succeeded` / `failed` |
  | `checkout.session.expired` | `expired` (payment or setup) |
  | `checkout.session.completed` (setup mode) | `setup` |
  | `payment_intent.succeeded` / `payment_intent.payment_failed` (off-session, matched by `metadata.paymentId`) | `succeeded` / `failed` |
  | `payment_intent.requires_action` | `failed` with `authentication_required` |
  | Anything else | `null` |

- **Currencies:** minimum charges (USD 0.50, GBP 0.30, EUR 0.50, INR 0.50…) live in `currencies.ts`. Zero-decimal currencies (JPY, KRW, VND…) are listed. Jarso's minor units map 1:1 for two-decimal currencies; for a zero-decimal currency the adapter returns `null` from `minimumChargeMinor` until it is needed (*my call*).
- **Env:**
  - `STRIPE_SECRET_KEY`: Zod requires the `sk_test_` prefix and refuses `sk_live_`.
  - `STRIPE_WEBHOOK_SECRET`: `whsec_…`, a different value locally (`stripe listen`) and in the dashboard endpoint.
  - Both are required only when `PAYMENTS_PROVIDER=stripe`.
- **Local dev:** `stripe listen --forward-to localhost:3000/api/v1/payments/webhooks/stripe`, then `stripe trigger …`. Documented in `docs/deploy.md`.
- **Test cards for the demo:**

  | Card | Behaviour |
  | --- | --- |
  | `4242 4242 4242 4242` | Success |
  | `4000 0000 0000 0341` | Saves, then the off-session charge fails |
  | `4000 0027 6000 3184` | Always needs authentication |
  | `4000 0000 0000 9995` | Insufficient funds |

## 8. Adding a second provider (the checklist this design guarantees)

1. Add `src/lib/payments/<id>/` implementing `PaymentProvider` (hosted payment, hosted setup, off-session charge, webhook verification and mapping, currency minimums).
2. Add `<id>` to `ProviderId` and one line in `src/lib/payments/registry.ts`.
3. Add its env vars (`env.server.ts`, `.env.example`), required only when `PAYMENTS_PROVIDER=<id>`.
4. Point the provider's webhooks at `/api/v1/payments/webhooks/<id>`.
5. Run the shared **adapter contract test suite** (run against every adapter with recorded fixtures; `src/lib/payments/contract.test.ts`) and the domain tests (which use `fake`).

No migration, no domain or UI change, no new route.

## 9. Constraints

- Follow the project rules: feature module, barrels, layering, `createAction` / `withApi`, `AppError`, `logger`. How `withApi` handles a raw body is the builder's call: extend it with a raw-body option, or keep the webhook route outside it with equivalent error handling.
- Env: `PAYMENTS_PROVIDER`, `CRON_SECRET` (≥ 16 chars), plus the provider-specific vars, all with placeholders in `.env.example`.
- Log payment IDs, provider refs and failure codes, never payment-method details or raw payloads. Consult `production-readiness` and `public-repo-security`. Add Stripe keys to the rotation runbook.
- Stripe failures map to safe, plain copy. The child never sees payment errors.

## 10. Testing

- **pgTAP:** card confirm functions post exactly once; card after cash → `succeeded_unapplied` with no ledger rows; RLS on the new tables; both partial unique indexes; auto-charge selection excludes items with an earlier `auto` attempt and items due before `auto_charge_since`.
- **Vitest:**
  - the `handleProviderEvent` state machine (duplicates, out of order, unknown payment);
  - `runAutoCharges` selection and split defaulting;
  - the minimum-amount rule;
  - the registry with `none`.
  - Stripe adapter: signature rejection, livemode rejection, event mapping and failure-code mapping, from recorded fixtures; the same fixtures drive the contract suite.
- **Playwright** with the `fake` provider: Pay by card → fake hosted page → signed fake webhook → jars update; cash after a pending card; toggle on, save card, cron run, posted; declined charge → inbox notice.
- **Manual demo pass** against real Stripe test mode with the cards in §7.

## 11. Docs to update

- `docs/domain.md`: card as a handover method; `payments` states.
- `docs/database.md`, `docs/api.md` (webhook route, cron route), `docs/architecture.md` (payments module, the provider registry).
- `docs/deploy.md`: env, webhook endpoint, Vault secret, pg_cron job, Vercel fallback cron, `stripe listen`.
- `docs/security.md`: Stripe keys in the rotation runbook.
- `REQUIREMENTS.md`: a note under FR01 that card handover is a test-mode showcase and real payments are still out of the pilot.
- `docs/roadmap.md`.
- ADR `0012-card-handover-payment-providers.md`: provider-agnostic interface, Stripe first, test mode only.

## 12. Left to the builder

- The copy (child-friendly on the child side, per `docs/design.md`) and the layout of Pay by card on the handover screen.
- Which settings tab holds the saved-card panel.
- The raw-body approach for `withApi`.
- Cron batch size.
- How the `fake` provider's hosted page looks.
