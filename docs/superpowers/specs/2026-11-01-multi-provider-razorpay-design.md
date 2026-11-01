# Several card providers at once, and Razorpay — design

- Date: 2026-11-01
- Builds on: `2026-10-31-stripe-card-handover-design.md` and ADR 0013. Everything there still holds unless this document changes it.
- Status: decided with the product owner (routing, auto-charge card, phone handling below).

## 1. Intent

Card handover shipped with one provider per deployment (`PAYMENTS_PROVIDER`). The product owner wants Razorpay added, and wants the app to run several providers at once. The parent picks which one pays. Razorpay supports both paying now and a saved card for auto charge.

## 2. Decisions

| # | Decision |
|---|---|
| D1 | `PAYMENTS_PROVIDER` is removed. A provider is on when all of its env keys are set. The fake is on when `PAYMENTS_ALLOW_FAKE=true` and `VERCEL_ENV` is not `production`. Several can be on at once. A provider with only some of its keys stays off and is logged once (names of the missing vars, never values). |
| D2 | The parent picks the provider at checkout. The handover screen shows one card button per provider that can charge the family currency. With exactly one such provider the button keeps today's label "Pay by card"; with more, each reads "Pay with {label}". Saving a card also names a provider. |
| D3 | An auto-charge toggle records which provider's saved card it charges (`auto_charge_provider` on `allowance_schedules` and `parent_gifts`). A parent may hold one saved card per provider. Removing a card turns off only the toggles that use that provider. |
| D4 | Each provider declares `label` (shown to the parent) and `autoChargeSettleMinutes` (how long an auto charge may stay pending before the stale sweep expires it). Stripe and fake: 30. Razorpay: 4320 (72 h), because the bank must notify the cardholder about 36 h before a repeat card debit. |
| D5 | Razorpay is test mode only: `RAZORPAY_KEY_ID` must match `^rzp_test_`. INR only (minimum 100 paise); every other currency returns null from `minimumChargeMinor`, so Razorpay buttons don't show for non-INR families. |
| D6 | Razorpay pay now uses a card-only Payment Link. Razorpay save card uses an order with a card token, opened in Razorpay Checkout from a small Jarso page, because the Registration Link needs the parent's phone number and can't send the parent back to Jarso. Razorpay refuses a card token order ("The contact/email field is required for recurring links") until the customer has an email and a phone, so before the order Jarso asks the parent for their mobile number in the save-card dialog, on every Razorpay save (nothing is kept to reuse), and passes it with the account email straight to Razorpay. A typed email is never used: Razorpay matches customers by email and phone, so another parent's exact pair would return their customer and show their saved cards in Checkout; an account with no email gets VALIDATION ("Add an email to your account to save a card with Razorpay."). The adapter finds or creates the Razorpay customer with that email and phone (`customers.create` with `fail_existing: "0"`) and opens the order for that customer, not the stored `customerRef`. Editing the stored customer would fail ("Customer already exists for the merchant") whenever another customer already has that email and phone, which is routine with one test account shared by local, preview and production. The saved card's `methodRef` carries the customer it was saved under, so charges and removal use it. Jarso stores neither value (no column, log field, audit detail or URL) and reads them back from Razorpay when it charges. |
| D7 | Switching provider mid-checkout: starting a manual card payment with provider B while a live, still `pending` manual checkout with provider A (with its page open) exists cancels A's row and opens B, whichever parent opened it (the same-provider reuse already shares that page between parents). A checkout in `requires_action` (the bank is checking the card) or one still opening is left alone: CONFLICT, as for an auto charge in flight. If A still completes at the provider, `apply_payment` posts it or marks it `succeeded_unapplied` (refund note), as today. |

## 3. Provider interface changes (`src/lib/payments/types.ts`)

```ts
export type PaymentProviderId = "stripe" | "razorpay" | "fake";
interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly label: string;                    // "Stripe" | "Razorpay" | "Test card"
  readonly autoChargeSettleMinutes: number;  // D4
  readonly setupNeedsContact: boolean;       // D6: razorpay true, stripe and fake false
  // createHostedSetup takes an optional contact?: { email: string; phone: string },
  // required when setupNeedsContact. Other methods unchanged.
}
```

Registry (`src/lib/payments/registry.ts`) exports `getPaymentProviders(): readonly PaymentProvider[]` (order: stripe, razorpay, fake; created once per server instance), `paymentsEnabled(): boolean` and `getPaymentProviderById(id): PaymentProvider | null` (only when that provider is on). `getPaymentProvider` and `paymentProviderName` are removed.

## 4. Data (one new migration, `payments_multi_provider`)

1. Widen every `provider in ('stripe', 'fake')` check to `('stripe', 'razorpay', 'fake')`: `payment_customers`, `payment_setups`, `payments`, `payment_webhook_events`.
2. `allowance_schedules.auto_charge_provider` and `parent_gifts.auto_charge_provider`: `text`, null, same provider check. Backfill rows with `auto_charge = true` from the payer's saved card (`payment_customers` with `method_ref is not null`, Stripe first, then by provider name); rows still without one get auto charge turned off (all three columns cleared). Then add the constraint `(auto_charge) = (auto_charge_provider is not null)`.
3. `write_auto_charge(p_parent_id, p_target_type, p_target_id, p_on, p_provider)`: on stores `auto_charge_provider = p_provider`; off clears it. `auto_charge_since` is kept only when the same payer **and** the same provider turn it on again. `set_auto_charge` and `arm_auto_charge` keep their signatures and grants.
4. `due_auto_charges(p_providers text[], p_now timestamptz, p_limit int)` replaces `due_auto_charges(text, timestamptz, int)` (drop the old one). It joins `payment_customers` on `pc.provider = auto_charge_provider`, keeps only rows whose `auto_charge_provider = any(p_providers)`, and returns a new `provider` column. Same grants as before (service role only).
5. `clear_auto_charge_by(p_parent_id uuid, p_provider text)` replaces `clear_auto_charge_by(uuid)` (drop the old one): turns off only toggles with `auto_charge_by = p_parent_id and auto_charge_provider = p_provider`. Same grants.
6. pgTAP covers: razorpay accepted in each provider column, the backfill, since-kept rules, `due_auto_charges` filtering by provider list and returning `provider`, and `clear_auto_charge_by` sparing other providers.

## 5. Domain (`src/features/payments`)

- `CardPaymentState` becomes:
  ```ts
  type CardPaymentState = {
    providers: { id: PaymentProviderId; label: string; available: boolean;
                 unavailableReason: "too_small" | "unsupported_currency" | null }[]; // empty = payments off
    pending: { provider: PaymentProviderId; redirectUrl: string | null } | null;
    lastOutcome: …unchanged;
  };
  ```
  Providers whose `minimumChargeMinor(currency)` is null are still listed with `unsupported_currency`. The UI hides them (§6) and shows the reason only when no provider is available.
- `startCardPayment` input gains `provider`. The provider must be on (else NOT_FOUND). Reuse rule: a live manual checkout of the **same** provider with a URL is reused; one of a **different** provider is cancelled (D7); an auto charge in flight is still CONFLICT.
- `startCardSetup`, `setAutoCharge` (when `on`) and `removeSavedCard` gain `provider`. `getSavedCard()` becomes `getSavedCards(): { provider; label; card: CardSummary | null }[]` for every provider that is on. `getAutoChargeCard()` returns, per provider that is on, `{ provider, label, cardSaved, unavailableReason }`, or null when payments are off.
- `runAutoCharges` passes the ids of the providers that are on to `due_auto_charges`, charges each item with `getPaymentProviderById(item.provider)`, and sets the auto row's `expires_at` from that provider's `autoChargeSettleMinutes`.
- Zod schemas gain `provider: z.enum(["stripe", "razorpay", "fake"])` where the input gains it.
- The cron route is 404 unless `paymentsEnabled()`. The fake page and fake checkout action are 404 unless `getPaymentProviderById("fake")`. The webhook route is unchanged (`/api/v1/payments/webhooks/[provider]`).

## 6. UI

- Pay by card (handover screen): one button per available provider (D2). When none is available, one disabled "Pay by card" button with the reason, as today.
- Settings: one saved-card panel per provider that is on, titled with the provider label only when more than one is on.
- Save card with a provider whose `setupNeedsContact` is true (Razorpay): the same dialog shows a step with a mobile number field (`type="tel"`), focused when the step appears ("Razorpay needs your mobile number to save a card. Jarso doesn't keep it."). The service requires the phone (spaces, dashes and brackets dropped, optional leading +, 8 to 15 digits) and uses the account email only; errors show on the field. `AutoChargeCard` carries `needsPhone`.
- Auto-charge toggle: turning on with exactly one saved card uses it. With several saved cards, the confirm dialog asks which. With none, the dialog asks which provider to save a card with (no question when only one is on). While on, and more than one provider is on, the toggle's help text names the card ("Visa •••• 4242, Stripe").
- Copy goes in `src/features/payments/copy.ts`, following `docs/design.md` voice (parents only; children never see any of this).

## 7. Razorpay adapter (`src/lib/payments/razorpay/`)

The official Razorpay Node SDK (`razorpay`, exact version pinned), injected as an optional `client` for tests like the Stripe adapter; requests time out at about 8 s; no automatic retries (Razorpay has no idempotency header). The table below names the REST endpoints; call them through the matching SDK methods (`customers.create`, `paymentLink.create`, `orders.create`, `payments.fetch`, `payments.createRecurringPayment`, `customers.deleteToken`). Network errors and 5xx become `AppError("UNAVAILABLE", "Card payments aren't available right now. You can still hand over cash.")` (same copy as Stripe). Razorpay types and ids never leave the folder. The factory takes `{ keyId, keySecret, webhookSecret, checkoutUrl, client? }`. `checkoutUrl` is `${NEXT_PUBLIC_APP_URL}/parent/payments/razorpay`.

| Method | Razorpay call |
|---|---|
| `minimumChargeMinor` | `INR` → 100, else null. |
| `ensureCustomer` | `POST /customers` `{ name: "Jarso parent", email?, fail_existing: "0", notes: { parentId } }` → `customerRef = id`. `fail_existing` must be the string `"0"`: Razorpay ignores the number 0 (the SDK's type) and refuses an existing customer. For Razorpay this contact-less customer (the service's `ensureCustomerRef`, stored per parent) is bookkeeping only: cards are saved under the customer `createHostedSetup` finds or creates by email and phone, and charges and removal use the customer in the card's `methodRef`. |
| `createHostedPayment` | `POST /payment_links` `{ amount, currency, accept_partial: false, description, reference_id: paymentId, expire_by: unix seconds, notify: { sms: false, email: false }, reminder_enable: false, callback_url: successUrl, callback_method: "get", options: { checkout: { method: { card: true, netbanking: false, upi: false, wallet: false, emi: false, paylater: false } } } }` → `{ redirectUrl: short_url, providerRef: id }`. `cancelUrl` is unused (Razorpay has no cancel redirect; an abandoned link expires). A duplicate `reference_id` (400) is UNAVAILABLE. |
| `createHostedSetup` | Without `contact` → VALIDATION (the service asks first). `POST /customers` `{ name: "Jarso parent", email, contact: phone, fail_existing: "0" }` finds or creates the customer with that email and phone (same email, other phone: another customer); a 400 whose `error.field` is `contact` or `email` → VALIDATION with a field error on `phone` or `email` (logged by code, reason and field name only), anything else (an unexpected "already exists" included) → UNAVAILABLE. Then `POST /orders` `{ amount: 100, currency: "INR", customer_id: <that customer>, method: "card", payment_capture: true, receipt: setupId, notes: { jarsoSetup: setupId }, token: { max_amount: 1500000, frequency: "as_presented" } }` → `providerRef = order id`, `redirectUrl = checkoutUrl?order=<id>&customer=<that customer>&success=<successUrl>&cancel=<cancelUrl>` (each value URL-encoded). The ₹1 authorisation is captured in test mode; documented, not refunded. |
| `chargeSaved` | `methodRef` = `"<customer_id>:<token_id>:<auth payment id>"`. `GET /payments/<auth payment id>` for `email` and `contact`; `POST /orders` `{ amount, currency, payment_capture: true, receipt: paymentId, notes: { jarsoCharge: paymentId } }`; `POST /payments/create/recurring` `{ email, contact, amount, currency, order_id, customer_id, token, recurring: true, description, notes: { jarsoCharge: paymentId } }`. Success → `{ providerRef: order id, status: "pending" }` (the outcome arrives by webhook). A 4xx from create/recurring → `{ providerRef: order id, status: "failed", failureCode: mapped }`. 5xx/network → UNAVAILABLE. A 4xx from the order or payment fetch → UNAVAILABLE (logged). |
| `detachMethod` | `DELETE /customers/<customer_id>/tokens/<token_id>`. A 400 whose description says the id does not exist is success. |
| `parseWebhook` | Verify `x-razorpay-signature` = hex HMAC-SHA256 of the raw body with the webhook secret (timing-safe). `eventId` = header `x-razorpay-event-id`. Missing or bad either → VALIDATION. If `payload.order.entity.public_key` or `payload.payment_link.entity`'s order `public_key` starts with `rzp_live_` → VALIDATION. Mapping below. |

Webhook mapping (anything else → null, including `payment.captured`). `notes` can arrive as `[]`; treat it as empty. Only server-set fields pick which Jarso payment or setup an event settles: `payment_link.reference_id` and order notes. Payment notes are browser-settable and never used for that.

| Event | Maps to |
|---|---|
| `payment_link.paid` | payment `succeeded`, `paymentId = payload.payment_link.entity.reference_id`, `providerRef = payment_link id`. |
| `payment_link.expired` / `payment_link.cancelled` | payment `expired` / `canceled`, same ids. |
| `order.paid` with `order.notes.jarsoSetup` | `setup`: `setupId`, `methodRef = customer_id:token_id:payment id` from `payload.payment.entity`, `card = { brand: card.network lower-cased, last4: card.last4 }`. When the payment has no `token_id` or `customer_id` → `setup_failed` (`failed`). When the payment has no `card` object, fetch `GET /payments/<id>?expand[]=card`. |
| `order.paid` with `order.notes.jarsoCharge` | payment `succeeded`, `providerRef = order id`. |
| `payment.failed` for a payment whose order carries `notes.jarsoCharge` | payment `failed`, `providerRef = payment.order_id`, `failureCode` from `error_reason`. The adapter fetches the order (`orders.fetch(payment.order_id)`) and reads `jarsoCharge` from the **order's** notes, which only the server sets; `payment.notes` is never trusted, because Checkout lets the browser set payment notes. Failed attempts on a Payment Link or in the save-card Checkout have no such order and are ignored: the parent can try again on the same page. |

`error_reason` → `FailureCode`: `card_declined`, `payment_declined`, `debit_declined`, `payment_risk_check_failed`, `debit_instrument_blocked` → `declined`; `insufficient_funds`, `insufficient_fund` → `insufficient_funds`; `authentication_failed`, `incorrect_otp`, `otp_expired`, `otp_attempts_exceeded` → `authentication_required`; `card_expired`, `incorrect_card_expiry_date` → `expired_card`; anything else → `other`.

### 7.1 Save-card page and return route

- Page `src/app/(app)/parent/payments/razorpay/page.tsx`: parent only (`requireUser` inside `<Suspense>`), 404 unless Razorpay is on. Parses `order`, `customer`, `success`, `cancel` with a Zod schema (`success` and `cancel` must be absolute URLs on `NEXT_PUBLIC_APP_URL`'s origin; ids match `^order_[A-Za-z0-9]+$` and `^cust_[A-Za-z0-9]+$`). Renders a client component that loads `https://checkout.razorpay.com/v1/checkout.js` and opens Checkout with `{ key: RAZORPAY_KEY_ID, order_id, customer_id, recurring: "1", redirect: true, callback_url: <return route>?success=…&cancel=…, modal: { ondismiss → location.assign(cancel) } }`. The key id is public by design; it is passed from the server page, not from a `NEXT_PUBLIC_` var.
- Route `src/app/api/v1/payments/razorpay/return/route.ts`: `POST` (Checkout posts a form there). 404 unless Razorpay is on. It never posts money or saves a card (the webhook does). If the form has `razorpay_payment_id`, 303 to `success`; otherwise 303 to `cancel`. `success` and `cancel` are validated the same way; when either is invalid, 303 to `/parent`.
- Any CSP or `next.config` change the script needs is added narrowly (`checkout.razorpay.com`, `api.razorpay.com`).

## 8. Security

- New secrets: `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (and the key id, treated as sensitive in Vercel even though Checkout uses it). Add to `.env.example` as placeholders, `docs/security.md` rotation runbook, gitleaks (`rzp_(test|live)_[A-Za-z0-9]{14,}`), `scripts/check-secrets.sh`, and the session-log hook's redaction in `.claude/hooks/extract-log.py`.
- The return route and the checkout page are open redirects unless validated: both accept only absolute URLs on the app's own origin.
- Webhook signature check fails closed, as for Stripe.

## 9. Known limits (documented, not built)

- Razorpay recurring on cards must be enabled on the account by Razorpay support.
- Test-mode card tokens last 3 days.
- `token.confirmed` can arrive 36–72 h after saving; Jarso treats the card as saved on `order.paid` and a later charge failure notifies the parent as usual.
- Repeat debits settle about 36 h after the charge starts, so an auto-charged allowance lands in the jars about a day and a half after its due day, and the item shows "card payment in progress" until then.
- Charges above ₹15,000 need the cardholder's extra authentication; the token's `max_amount` is ₹15,000.
- No refunds of the ₹1 save-card authorisation.

## 10. Testing

- Unit tests live in `tests/` mirroring `src/` (see `docs/testing.md`).
- Contract suite (`tests/lib/payments/contract.test.ts`) runs for fake, stripe and razorpay, each with its own test currency (GBP, GBP, INR).
- Razorpay: arguments passed to each SDK method on an injected client stub, signature accept/reject, every mapping row, failure-code mapping, `notes: []`.
- Registry: on/off per key set, several on at once, partial keys warn once, fake gates.
- Domain: provider choice, D7 switching, per-provider saved cards, toggle provider, auto charge uses each item's provider and settle window.
- e2e `payments.spec.ts` keeps passing with only the fake on; button names handle "Pay by card" or "Pay with Test card".
- pgTAP per §4.6.

## 11. Docs

ADR 0014 (several providers at once; Razorpay; corrects ADR 0013's "no migration" claim and its `PAYMENTS_PROVIDER` decision; 0013 gets a "Partly superseded by 0014" status), `docs/deploy.md` (env table, Razorpay dashboard webhook with events `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled`, `order.paid`, `payment.failed`; enabling recurring), `docs/api.md` (return route), `docs/architecture.md`, `docs/database.md`, `docs/testing.md`, `docs/security.md`, `docs/fr-audit.md`, `.env.example`, `playwright.config.ts`.
