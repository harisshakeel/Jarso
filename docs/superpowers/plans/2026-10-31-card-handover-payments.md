# Card handover through a payment provider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parents pay a due allowance or one-time gift by card (manual or auto charge) through a swappable payment provider, Stripe test mode first, and the handover posts to the child's jars exactly once.

**Architecture:** A provider layer in `src/lib/payments` (interface, registry, `stripe` and `fake` adapters; no domain, no database) under a domain module `src/features/payments` (service, repository, webhook state machine, auto charge, UI). Money posts only through a service-role SQL function that shares the lock order and ledger keys of the cash handover. Scheduling is pg_cron + pg_net calling a cron route, with a daily Vercel Cron as fallback.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (pgTAP, pg_cron, pg_net, Vault), `stripe` 23.1.0 (API `2026-10-28.endive`), Zod 4, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-stripe-card-handover-design.md`

## Global Constraints

- Stripe **test mode only**: `STRIPE_SECRET_KEY` must match `^(sk|rk)_test_`; webhook events with `livemode: true` are rejected.
- `PAYMENTS_PROVIDER` ∈ `none | stripe | fake`, default `none`. `none` → no payment UI renders, the payment routes return 404, and cash handover is unchanged.
- `fake` needs `PAYMENTS_ALLOW_FAKE=true` and is refused when `VERCEL_ENV === "production"`.
- Stripe types and IDs never leave `src/lib/payments/stripe/`. Domain code sees only `PaymentProvider`, `ProviderEvent` and opaque `*Ref` strings.
- `@/lib/payments` is a server-only entry point (starts with `import "server-only"`), imported directly and not re-exported from `@/lib`.
- Money is integer minor units. Card always pays the item's **full** `amount_minor`, with `cash + saved = amount`.
- Never store or log card numbers, CVC or raw provider payloads. Log only payment IDs, provider refs and failure codes, using `logger` from `@/lib`.
- Provider failures → `AppError("UNAVAILABLE", "Card payments aren't available right now. You can still hand over cash.", { cause })`. Bad signature or live-mode event → `AppError("VALIDATION", …)`.
- Checkout expiry is 30 minutes. Idempotency keys: `customer:<parentId>`, `pay:<paymentId>`, `setup:<setupId>`, `charge:<paymentId>`.
- One automatic attempt per item (unique index). Auto charge only covers items due on or after `auto_charge_since`.
- Every new table enables RLS with per-operation policies in the same migration. Regenerate `src/types/database.types.ts`.
- Commits follow Conventional Commits, with no AI attribution, one focused commit per task (more if a task naturally splits). Commit `.claude-logs/` with the work.
- Child-facing copy is simple and encouraging. The child never sees payment state, card details or failures.

## Review Focus

1. **Webhook for a payment this database doesn't know** (local, preview and production share one Stripe test account) → respond 200 and ignore. Never 500, or Stripe retries and disables the endpoint. Test in Task 4.
2. **Gift edited or cancelled, or allowance marked not given, while a card payment is pending** → blocked with JA409. Also, `apply_payment` refuses to post if `payments.amount_minor` ≠ the source amount (→ `succeeded_unapplied`). Tests in Task 2.
3. **The payer is no longer a parent of the child by the time the webhook arrives** → the money is still applied (it was taken), and `confirmed_by` is the payer. Test in Task 2.
4. **The parent backs out of Checkout and taps Pay by card again** → within 30 min the same pending payment and URL are reused; after expiry a new payment is created. Test in Task 3.
5. **A child session queries `payments`, `payment_customers` or `payment_setups`** → zero rows. The child's history still shows "Paid by card" via `ledger_entries.method`. Tests in Task 2 and Task 6.

---

### Task 1: Provider layer in `src/lib/payments`

**Files:**
- Modify: `src/config/env.server.ts` (already done on the branch: `PAYMENTS_PROVIDER`, `PAYMENTS_ALLOW_FAKE`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`), `.env.example`, `package.json` (`stripe@^23.1.0`, already installed)
- Create: `src/lib/payments/{index.ts,types.ts,registry.ts}`, `src/lib/payments/fake/index.ts`, `src/lib/payments/stripe/{index.ts,map-event.ts,currencies.ts}`, `src/lib/payments/stripe/fixtures/*.json`
- Test: `src/lib/payments/registry.test.ts`, `src/lib/payments/contract.test.ts`, `src/lib/payments/stripe/map-event.test.ts`, `src/lib/payments/stripe/currencies.test.ts`, `src/lib/payments/stripe/index.test.ts`

**Interfaces:**
- Produces, in `types.ts` (exact):
```ts
export type PaymentProviderId = "stripe" | "fake";
export type PaymentStatus = "pending" | "requires_action" | "succeeded" | "failed" | "canceled" | "expired";
export type FailureCode = "declined" | "insufficient_funds" | "authentication_required" | "expired_card" | "other";
export type CardSummary = { brand: string; last4: string };
export type ProviderEvent =
  | { kind: "payment"; eventId: string; paymentId: string; providerRef: string; status: PaymentStatus; failureCode?: FailureCode }
  | { kind: "setup"; eventId: string; setupId: string; methodRef: string; card: CardSummary }
  | { kind: "setup_failed"; eventId: string; setupId: string; reason: "expired" | "failed" };
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  minimumChargeMinor(currency: string): number | null;
  ensureCustomer(i: { parentId: string; email: string | null }): Promise<{ customerRef: string }>;
  createHostedPayment(i: { paymentId: string; amountMinor: number; currency: string; customerRef: string;
    description: string; successUrl: string; cancelUrl: string; expiresAt: Date }): Promise<{ redirectUrl: string; providerRef: string }>;
  createHostedSetup(i: { setupId: string; customerRef: string; successUrl: string; cancelUrl: string }): Promise<{ redirectUrl: string; providerRef: string }>;
  chargeSaved(i: { paymentId: string; amountMinor: number; currency: string; customerRef: string;
    methodRef: string; description: string }): Promise<{ providerRef: string; status: PaymentStatus; failureCode?: FailureCode }>;
  detachMethod(methodRef: string): Promise<void>;
  parseWebhook(rawBody: string, headers: Headers): Promise<ProviderEvent | null>;
}
```
- `registry.ts`: `paymentProviderName(): PaymentProviderId | null`, `getPaymentProvider(): PaymentProvider | null` (memoised per instance, same shape as `src/features/guide/server/config.ts`), `getPaymentProviderById(id: string): PaymentProvider | null` (the active provider only if its id matches, else null).
- `fake/index.ts`:
  - `createFakePaymentProvider(opts: { hostedUrl: string }): PaymentProvider`
  - `signFakeWebhook(body: string): string`
  - `FAKE_SIGNATURE_HEADER = "x-fake-signature"`
  - `FAKE_METHODS = { ok: "fake_pm_ok", decline: "fake_pm_decline", auth: "fake_pm_auth" } as const`
- `stripe/index.ts`: `createStripePaymentProvider(opts: { secretKey: string; webhookSecret: string; client?: Stripe }): PaymentProvider`, `STRIPE_API_VERSION = "2026-10-28.endive"`.
- `stripe/map-event.ts`: `mapStripeEvent(event: Stripe.Event, retrieveSetupIntent: (id: string) => Promise<Stripe.SetupIntent>): Promise<ProviderEvent | null>`, `mapFailureCode(code?: string | null, declineCode?: string | null): FailureCode`.
- `stripe/currencies.ts`: `stripeMinimumChargeMinor(currency: string): number | null`.
- `index.ts` re-exports all of the above (types plus the three registry functions, `signFakeWebhook`, `FAKE_SIGNATURE_HEADER`, `FAKE_METHODS`).

- [ ] **Step 1: Write failing tests**
  - `registry.test.ts`, mocking `@/config/env.server`:
    - `none` → `paymentProviderName()` is `null` and `getPaymentProvider()` is `null`;
    - `stripe` with both keys → `"stripe"`; `stripe` without a webhook secret → `null`;
    - `fake` without `PAYMENTS_ALLOW_FAKE` → `null`; `fake` with `VERCEL_ENV: "production"` → `null`;
    - `getPaymentProviderById("fake")` while stripe is active → `null`.
  - `currencies.test.ts`:
    - `stripeMinimumChargeMinor("USD") === 50`, `("gbp") === 30`, `("EUR") === 50`, `("INR") === 50`;
    - `("JPY") === null` (zero-decimal, unsupported for now), `("XYZ") === null`.
  - `map-event.test.ts` (`// @vitest-environment node`), using fixtures:

    | Event | Expect |
    | --- | --- |
    | `checkout.session.completed`, payment mode, `payment_status: "paid"`, `client_reference_id: "pay-1"` | `{ kind: "payment", paymentId: "pay-1", status: "succeeded", providerRef: "cs_test_…" }` |
    | same, `payment_status: "unpaid"` | `null` |
    | setup mode, `client_reference_id: "setup-1"` (stub `retrieveSetupIntent` returns `status: "succeeded"`, `payment_method: { id: "pm_1", card: { brand: "visa", last4: "4242" } }`) | `{ kind: "setup", setupId: "setup-1", methodRef: "pm_1", card: { brand: "visa", last4: "4242" } }` |
    | `checkout.session.expired`, payment mode | `status: "expired"` |
    | `checkout.session.expired`, setup mode | `{ kind: "setup_failed", reason: "expired" }` |
    | `payment_intent.succeeded` with `metadata.paymentId: "pay-2"` | `status: "succeeded"`, `providerRef: "pi_…"` |
    | `payment_intent.succeeded` without `metadata.paymentId` (Checkout's own intent) | `null` |
    | `payment_intent.payment_failed` with `last_payment_error: { code: "card_declined", decline_code: "insufficient_funds" }` | `failureCode: "insufficient_funds"` |
    | `payment_intent.requires_action` | `status: "failed", failureCode: "authentication_required"` |
    | `customer.created` | `null` |

    Plus `mapFailureCode` truth table:
    - `("authentication_required")` → `authentication_required`
    - `("expired_card")` → `expired_card`
    - `("card_declined", "insufficient_funds")` → `insufficient_funds`
    - `("card_declined", "generic_decline")` → `declined`
    - `("processing_error")` → `other`
  - `stripe/index.test.ts` (node env; a real `new Stripe("sk_test_dummy")` client with `vi.spyOn` on its resource methods):
    - `parseWebhook` with a body signed by `stripe.webhooks.generateTestHeaderString({ payload, secret })` → mapped event.
    - Wrong signature → throws `AppError` code `VALIDATION`.
    - A `livemode: true` event → throws `VALIDATION`.
    - `createHostedPayment` calls `checkout.sessions.create` with `mode: "payment"`, `payment_method_types: ["card"]`, `client_reference_id: paymentId`, `currency` lower-cased, `unit_amount: amountMinor`, `expires_at: Math.floor(expiresAt/1000)`, no `payment_intent_data.metadata`, and options `{ idempotencyKey: "pay:<paymentId>" }`.
    - `chargeSaved`: a thrown `StripeCardError` with `code: "card_declined"` and `payment_intent: { id: "pi_x" }` → resolves `{ status: "failed", failureCode: "declined", providerRef: "pi_x" }`. A thrown `StripeConnectionError` → rejects with `AppError` code `UNAVAILABLE`.
    - `detachMethod`: `resource_missing` → resolves.
  - `contract.test.ts`: `describe.each` over `[fake, stripe-with-stubbed-client]`, run with the same assertions:
    - `minimumChargeMinor("GBP")` is a positive integer;
    - `createHostedPayment` returns a non-empty `redirectUrl` and `providerRef`;
    - `parseWebhook` of an adapter-signed `payment succeeded` body for `paymentId: "pay-c"` → `{ kind: "payment", paymentId: "pay-c", status: "succeeded" }`;
    - a tampered body → rejects with `VALIDATION`.

    Each adapter supplies a `signedSucceeded(paymentId)` helper in the test file.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/payments`. Expected: FAIL, modules not found.
- [ ] **Step 3: Implement** the files above.
  - **Stripe adapter:**
    - Construct with `new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 1, timeout: 8000 })`.
    - `ensureCustomer` → `customers.create({ email: email ?? undefined, metadata: { parentId } }, { idempotencyKey })`.
    - Setup: a Checkout Session with `mode: "setup"`, `payment_method_types: ["card"]`, `client_reference_id: setupId`, `setup_intent_data: { metadata: { setupId } }`.
    - `chargeSaved` → `paymentIntents.create({ amount, currency, customer, payment_method, off_session: true, confirm: true, description, metadata: { paymentId } }, { idempotencyKey })`. Map the intent's `succeeded` → `succeeded`, `processing` → `pending`, `requires_action` → `failed` + `authentication_required`.
    - `parseWebhook` reads the `stripe-signature` header, calls `webhooks.constructEvent`, rejects `livemode`, then calls `mapStripeEvent(event, id => client.setupIntents.retrieve(id, { expand: ["payment_method"] }))`.
  - **Minimum charges:** usd 50, gbp 30, eur 50, inr 50, aud 50, cad 50, nzd 50, sgd 50, chf 50; anything else null.
  - **Fake adapter:**
    - HMAC-SHA256 of the body with the constant secret `"jarso-fake-payments"` (it only ever runs off production, behind two opt-ins). The webhook body is the `ProviderEvent` JSON itself.
    - `createHostedPayment` → `redirectUrl = ${hostedUrl}?mode=payment&ref=<paymentId>&success=<enc successUrl>&cancel=<enc cancelUrl>`, `providerRef: "fake_cs_<paymentId>"`.
    - `chargeSaved` outcome by `methodRef`: `fake_pm_ok` → succeeded; `fake_pm_decline` → failed `declined`; `fake_pm_auth` → failed `authentication_required`.
    - `minimumChargeMinor` = 1 for any `^[A-Z]{3}$`.
  - **Registry:**
    - stripe needs both Stripe env vars;
    - the fake's `hostedUrl` = `${clientEnv.NEXT_PUBLIC_APP_URL}/dev/payments/fake`.
  - **`.env.example`:** append a commented block with `PAYMENTS_PROVIDER`, `PAYMENTS_ALLOW_FAKE`, `STRIPE_SECRET_KEY=sk_test_…` and `STRIPE_WEBHOOK_SECRET=whsec_…` as placeholders, the same style as the guide block. Write it with an append; do not read the file.
- [ ] **Step 4: Run** `pnpm vitest run src/lib/payments && pnpm typecheck && pnpm lint`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(payments): provider layer with Stripe and fake adapters`

---

### Task 2: Database — payment tables, auto-charge columns, `apply_payment`

**Files:**
- Create: `supabase/migrations/<ts>_payments.sql` (via `pnpm db:migration payments`), `supabase/tests/database/payments.test.sql`
- Modify: `src/types/database.types.ts` (regenerated)

**Interfaces (SQL, exact names):**
- **Tables** (columns per spec §6.3):
  - `payment_customers (parent_id, provider) PK`
  - `payment_setups` (adds `arm_type text check in ('allowance_schedule','parent_gift')`, `arm_id uuid`, both nullable)
  - `payments` (`status` adds `succeeded_unapplied`)
  - `payment_webhook_events (provider, event_id) PK`
- **Indexes:**
  - `payments_one_live_per_source` unique on `(source_type, source_id) where status in ('pending','requires_action','succeeded')`
  - `payments_one_auto_per_source` unique on `(source_type, source_id) where trigger = 'auto'`
- **Columns:**
  - `auto_charge boolean not null default false`, `auto_charge_by uuid references profiles on delete set null`, `auto_charge_since timestamptz` on `allowance_schedules` and `parent_gifts`
  - `method text not null default 'cash' check (method in ('cash','card'))` on `ledger_entries`
- **Notifications:** kind `card_charge_failed`, source type `payment` (drop and re-add both check constraints, including every existing value).
- **Functions:**
  - `apply_payment(p_payment_id uuid) returns text`: `security definer`; execute for `service_role` only. Returns `'confirmed' | 'already_confirmed' | 'not_given' | 'cancelled' | 'amount_changed' | 'already_applied'`.
    - Locks, in order: payment row, then source row, then `pg_advisory_xact_lock(hashtextextended('ledger:'||child_id,0))`.
    - On success it posts the ledger rows with the existing keys (`occurrence:<id>:spend|save` / `parent_gift:<id>:spend|save`), labels `'Allowance'` / `coalesce(note,'Gift')`, `method = 'card'`, `created_by = payer_id`; marks the source confirmed or given with the payer; sets the payment to `succeeded`.
    - Every non-confirmed outcome except `already_applied` sets `succeeded_unapplied`.
  - `fail_payment(p_payment_id uuid, p_status text, p_failure_code text) returns void`: service role only.
    - Sets `failed` / `expired` / `canceled` only from `pending` / `requires_action`.
    - When `trigger = 'auto'` and the new status is `failed`, inserts a `card_charge_failed` notification for `payer_id` (source_type `payment`, source_id the payment).
  - `due_auto_charges(p_provider text, p_now timestamptz default now(), p_limit int default 50)`: service role only. Returns `table(source_type text, source_id uuid, family_id uuid, child_id uuid, payer_id uuid, amount_minor bigint, currency text, customer_ref text, method_ref text)`.
    - Due occurrences whose schedule has `auto_charge` and `due_on >= (auto_charge_since at time zone family tz)::date`, plus due gifts with `auto_charge` and `give_on >= …`, and `give_on <= family_today`.
    - Requires a payer card for `p_provider` with `method_ref is not null`.
    - Excludes sources with any `auto` payment or any live payment.
  - `set_auto_charge(p_target_type text, p_target_id uuid, p_on boolean, p_provider text) returns void`: parent-only definer (`auth.uid()` must be a parent of the target's child; JA403 otherwise).
    - When on, requires the caller's card for `p_provider` (JA409 `'Save a card first'`) and sets `auto_charge_by = auth.uid()`, `auto_charge_since = now()`.
    - When off, clears all three columns.
  - `clear_auto_charge_by(p_parent_id uuid) returns void`: service role only.
- **Guards:** redefine `update_gift`, `cancel_gift` and `mark_not_given` (copy their latest bodies) to raise `JA409 'A card payment is in progress'` when a live `pending` / `requires_action` payment exists for the source.
- **History:** `list_ledger_history` gains an output column `method text` (drop and recreate with the same grants; body from `20261029183422_purchases.sql:311`).
- **RLS:**
  - `payment_customers` / `payment_setups`: select where `parent_id = auth.uid()`.
  - `payments`: select where `is_parent_of(child_id)`.
  - `payment_webhook_events`: no `authenticated` policies.
  - Revoke insert/update/delete/truncate from `anon` and `authenticated` on all four tables.

- [ ] **Step 1: Write `payments.test.sql`** (`begin; \ir _helpers.psql; select plan(N);`, users via `tests.create_user`). Assertions:
  - `apply_payment` on a due occurrence (cash 300, saved 200) → `'confirmed'`; two ledger rows with `method = 'card'`; a second call → `'already_applied'` with the row count unchanged.
  - Cash `confirm_handover` first, then `apply_payment` → `'already_confirmed'`; payment status `succeeded_unapplied`; no card ledger rows.
  - Gift: `update_gift` and `cancel_gift` with a pending payment → `throws_ok(…, 'JA409')`. `mark_not_given` with a pending payment → JA409.
  - Amount mismatch (payment 400, occurrence 500) → `'amount_changed'`, `succeeded_unapplied`.
  - Payer removed from `family_members` before apply → still `'confirmed'`, and `confirmed_by = payer`.
  - Concurrent auto runs: insert the auto payment twice for the same source → the second violates `payments_one_auto_per_source`.
  - `due_auto_charges`:
    - excludes an occurrence due before `auto_charge_since`;
    - includes one due after;
    - excludes it once an `auto` row exists (any status, including `failed`);
    - excludes a parent without `method_ref`.
  - `fail_payment(…, 'failed', 'declined')` on an auto payment → one `card_charge_failed` notification for the payer. On a manual payment → none.
  - RLS: as the child, `select count(*)` from `payments`, `payment_customers` and `payment_setups` = 0. As the parent, `payments` returns their child's row. `authenticated` cannot `execute` `apply_payment` (`throws_ok … '42501'`).
  - `list_ledger_history` returns `method` for the child.
- [ ] **Step 2: Run** `pnpm db:reset && pnpm db:test`. Expected: FAIL (functions or tables missing).
- [ ] **Step 3: Write the migration** with the interfaces above. Use the comment style and the `security definer set search_path = ''` pattern of `20261029161729_handover_closed_results.sql`.
- [ ] **Step 4: Run** `pnpm db:reset && pnpm db:test && pnpm db:types && pnpm typecheck`. Expected: PASS, and the types include the new tables and functions.
- [ ] **Step 5: Commit** `feat(payments): payment tables, auto charge and apply_payment`

---

### Task 3: Domain service and actions (manual pay, saved card, toggle)

**Files:**
- Create: `src/features/payments/{index.ts,types.ts,schemas.ts,copy.ts}`, `src/features/payments/server/{index.ts,repository.ts,service.ts,actions.ts}`
- Modify: `src/features/allowance/server/index.ts` (export `getLastSplitWith`), `src/features/allowance/server/service.ts` (factor `getLastSplitWith(db, childId)` out of `getLastSplit`, around line 149)
- Test: `src/features/payments/server/service.test.ts`, `src/features/payments/schemas.test.ts`

**Interfaces:**
- Consumes: Task 1 `getPaymentProvider`, `PaymentProvider`, `FailureCode`, `CardSummary`. Task 2 tables and `set_auto_charge`.
- Produces, in `types.ts`:
  - `PaymentSource = { type: "occurrence" | "parent_gift"; id: string }`
  - `CardPaymentState = { available: boolean; unavailableReason: "off" | "too_small" | "unsupported_currency" | null; pending: { redirectUrl: string | null } | null; lastOutcome: { status: "succeeded_unapplied" | "failed"; failureCode: FailureCode | null } | null }`
  - `AutoChargeTarget = { type: "allowance_schedule" | "parent_gift"; id: string }`
- Produces, from `server/service.ts`:
  - `getCardPaymentState(childId: string, source: PaymentSource): Promise<CardPaymentState>`
  - `startCardPayment(i: { kind: "allowance" | "gift"; id: string; cashMinor: number; savedMinor: number }): Promise<{ redirectUrl: string }>`
  - `startCardSetup(i: { arm: AutoChargeTarget | null; returnTo: string }): Promise<{ redirectUrl: string }>`
  - `setAutoCharge(i: AutoChargeTarget & { on: boolean; returnTo: string }): Promise<{ redirectUrl: string | null }>` (non-null when a card must be saved first)
  - `getSavedCard(): Promise<CardSummary | null>`
  - `removeSavedCard(): Promise<void>`
  - `paymentsEnabled(): boolean`
- Produces, from `server/actions.ts` (`"use server"`, `createAction`, `redirect()` on a URL result): `startCardPaymentAction`, `setAutoChargeAction`, `removeSavedCardAction`.
- `schemas.ts`: `cardPaymentSchema(currency, amountMinor)` reuses the handover's money parsing and refines `cash + saved === amountMinor` (message `"Card pays the full amount"`); `autoChargeSchema`.
- Allowance: `getLastSplitWith(db: SupabaseClient<Database>, childId: string): Promise<Split | null>`.

- [ ] **Step 1: Write failing tests**, mocking the repository and using the fake provider:
  - `startCardPayment` on a due allowance:
    - inserts a payment `{ trigger: "manual", status: "pending", amount_minor: 500, expires_at ≈ now + 30 min }`;
    - calls `createHostedPayment` with that `paymentId`;
    - returns its `redirectUrl`.
  - **Review Focus 4:** a second call within 30 min returns the **same** `redirectUrl`, with no new insert. After `expires_at` it marks the old row `expired` and creates a new one.
  - `cash + saved ≠ amount` → `AppError` `VALIDATION`.
  - Amount below `minimumChargeMinor` → `AppError` `VALIDATION`, message `"Too small to pay by card"`.
  - `paymentsEnabled() === false` → every entry point throws `NOT_FOUND`.
  - `setAutoCharge({ on: true })` with no saved card → returns a `redirectUrl` from `createHostedSetup`, and `payment_setups` stores `arm_type` / `arm_id`. With a card → calls `set_auto_charge`, returns `{ redirectUrl: null }`.
  - `removeSavedCard` → `detachMethod(methodRef)`, clears `method_ref`, calls `clear_auto_charge_by`.
  - `getCardPaymentState` → `unavailableReason: "unsupported_currency"` for JPY; `pending` set when a live row exists.
- [ ] **Step 2: Run** `pnpm vitest run src/features/payments`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Auth:** parent checks via `assertParentOf(childId)` from `@/features/family/server`; the user via `assertUser()`.
  - **Clients:** the payments, customers and setups inserts use `createAdminClient()`, after authorisation, because the tables are service-role-write. Reads use the RLS client.
  - **URLs:** `successUrl` / `cancelUrl` = `${NEXT_PUBLIC_APP_URL}/parent/children/<childId>/handover/<kind>/<id>?card=returned|cancelled`.
  - **Description:** `"Allowance for <nickname>"` / `"Gift for <nickname>"`.
  - **Ensure customer:** if there's no `payment_customers` row for (parent, provider), call `ensureCustomer` and insert.
  - Copy lives in `copy.ts`.
- [ ] **Step 4: Run** `pnpm vitest run src/features/payments src/features/allowance && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(payments): start card payments, save cards and toggle auto charge`

---

### Task 4: Webhook state machine and route

**Files:**
- Create: `src/features/payments/status.ts`, `src/features/payments/server/webhooks.ts`, `src/app/api/v1/payments/webhooks/[provider]/route.ts`
- Test: `src/features/payments/status.test.ts`, `src/features/payments/server/webhooks.test.ts`, `src/app/api/v1/payments/webhooks/[provider]/route.test.ts`

**Interfaces:**
- Consumes: Task 1 `getPaymentProviderById`, `ProviderEvent`. Task 2 `apply_payment`, `fail_payment`, `set_auto_charge` semantics, `clear_auto_charge_by`.
- Produces:
  - `nextStatus(current: StoredStatus, incoming: PaymentStatus): PaymentStatus | null` in `status.ts`, where `StoredStatus = PaymentStatus | "succeeded_unapplied"`. Rules:
    - `succeeded` is reachable from any non-succeeded state;
    - nothing leaves `succeeded` / `succeeded_unapplied`;
    - `failed`, `expired` and `canceled` only from `pending` / `requires_action`;
    - same → same returns `null`.
  - `handleProviderEvent(provider: PaymentProviderId, event: ProviderEvent): Promise<"applied" | "duplicate" | "ignored">` in `webhooks.ts`, admin client:
    - insert `payment_webhook_events`, a conflict → `"duplicate"`;
    - unknown `paymentId` / `setupId` → `"ignored"` plus `logger.info`;
    - `payment` → `nextStatus`, then `apply_payment` (succeeded) or `fail_payment`;
    - `setup` → upsert the card onto `payment_customers`, set the setup to `succeeded`, and if `arm_*` is set apply the toggle for the setup's parent (service-role update mirroring `set_auto_charge`);
    - `setup_failed` → mark the setup.
- Route: `export const runtime = "nodejs"`; `POST = withApi(async (req: Request, ctx: RouteContext<"/api/v1/payments/webhooks/[provider]">) => …)`.
  - Unknown or inactive provider → `AppError("NOT_FOUND")`.
  - Otherwise `const raw = await req.text()`, then `provider.parseWebhook(raw, req.headers)`, then `handleProviderEvent`, then `json({ received: true })`.
  - A `null` event → `json({ received: true })`.

- [ ] **Step 1: Write failing tests:**
  - `status.test.ts`: the truth table above, including `expired → succeeded` = `"succeeded"`, `succeeded → failed` = `null`, `failed → failed` = `null`.
  - `webhooks.test.ts`, with the repository mocked:
    - the same `eventId` twice → the second is `"duplicate"`, and `apply_payment` is called once;
    - **Review Focus 1:** an unknown `paymentId` → `"ignored"`, no throw;
    - an out-of-order `expired` after `succeeded` → no `fail_payment` call;
    - a `setup` event with an arm → card saved and the toggle on.
  - `route.test.ts`, with `PAYMENTS_PROVIDER=fake`:
    - a body signed by `signFakeWebhook` → 200 `{ data: { received: true } }`;
    - a bad signature → 400;
    - `/webhooks/stripe` while fake is active → 404;
    - an unknown `paymentId` → 200.
- [ ] **Step 2: Run** `pnpm vitest run src/features/payments src/app/api/v1/payments`. Expected: FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run** the same command plus `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(payments): provider webhooks post card handovers once`

---

### Task 5: Auto charge job, cron route and scheduling

**Files:**
- Create: `src/features/payments/server/auto-charge.ts`, `src/app/api/cron/payments/auto-charge/route.ts`, `supabase/migrations/<ts>_payments_auto_charge_cron.sql`
- Modify: `src/config/env.server.ts` (`CRON_SECRET: z.string().min(16).optional()`), `.env.example` (append `# CRON_SECRET=…`), `vercel.json` (add `"crons": [{ "path": "/api/cron/payments/auto-charge", "schedule": "30 3 * * *" }]`)
- Test: `src/features/payments/server/auto-charge.test.ts`, `src/app/api/cron/payments/auto-charge/route.test.ts`

**Interfaces:**
- Consumes: Task 2 `due_auto_charges`, `payments_one_auto_per_source`, `fail_payment`. Task 3 `getLastSplitWith`; `prefillSplit` from `@/features/allowance`. Task 4 `handleProviderEvent` semantics (synchronous success calls `apply_payment` directly; the later webhook is then `already_applied`).
- Produces:
  - `runAutoCharges(now?: Date): Promise<{ attempted: number; succeeded: number; failed: number; skipped: number }>`
  - Route `GET` and `POST`:
    - `CRON_SECRET` unset → 404;
    - header `authorization` must equal `Bearer ${CRON_SECRET}`, compared with `crypto.timingSafeEqual`, else 401;
    - returns `json(result)`.

- [ ] **Step 1: Write failing tests:**
  - `auto-charge.test.ts`, with the repository mocked and the fake provider:
    - two due rows → inserts two `auto` payments with the split from `prefillSplit(amount, lastSplit)` (no last split → all to cash);
    - `fake_pm_ok` → `apply_payment` called, `succeeded: 1`;
    - `fake_pm_decline` → `fail_payment(id, "failed", "declined")`, `failed: 1`;
    - an insert unique violation (`23505`) → `skipped: 1`, no provider call;
    - a provider `UNAVAILABLE` → the payment is left `pending` (the webhook or expiry settles it), counted as `failed`, and the loop continues.
  - `route.test.ts`:
    - no `CRON_SECRET` → 404;
    - a wrong bearer → 401;
    - the right bearer → 200 with the counts.
- [ ] **Step 2: Run** `pnpm vitest run src/features/payments/server/auto-charge.test.ts src/app/api/cron`. Expected: FAIL.
- [ ] **Step 3: Implement.** Migration:
  - Guarded like the pg_cron block in `20261030164347_inbox_reminders.sql:89-102`.
  - `create extension if not exists pg_net` when available.
  - Schedule `charge-due-cards` at `'9 * * * *'` running `select public.trigger_auto_charge()`.
  - `trigger_auto_charge()` (security definer, revoked from public, anon and authenticated):
    - reads `app_url` and `cron_secret` from `vault.decrypted_secrets`;
    - returns without doing anything if either is missing;
    - otherwise calls `net.http_post(url := app_url || '/api/cron/payments/auto-charge', headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret, 'Content-Type', 'application/json'), body := '{}'::jsonb)`.
- [ ] **Step 4: Run** `pnpm vitest run src/features/payments src/app/api/cron && pnpm db:reset && pnpm db:test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(payments): hourly auto charge through pg_cron with a daily Vercel fallback`

---

### Task 6: Parent and child UI

**Files:**
- Create:
  - `src/features/payments/components/{pay-by-card.tsx,payment-status-note.tsx,auto-charge-toggle.tsx,saved-card-panel.tsx,index.ts}` (the components' barrel is re-exported from `src/features/payments/index.ts`)
- Modify:
  - Handover page and form: `src/app/(app)/parent/children/[childId]/handover/[kind]/[id]/page.tsx`, `src/features/allowance/components/handover-form.tsx` (render `<PayByCard>` beside the cash submit when `state.available`)
  - Auto-charge toggle on both allowance pages and both gift pages: `src/app/(app)/parent/children/[childId]/allowance/page.tsx`, `.../allowance/edit/page.tsx`, `.../gifts/new/page.tsx`, `.../gifts/[giftId]/edit/page.tsx`
  - Settings: `src/app/(app)/parent/settings/page.tsx` (`<SavedCardPanel>` inside the `"you"` tab)
  - Notifications (new kind `card_charge_failed`): `src/features/notifications/types.ts`, `src/features/notifications/links.ts`, `src/features/notifications/components/inbox-item.tsx`
  - History ("Paid by card"): `src/features/ledger/server/repository.ts`, `src/features/ledger/server/service.ts`, `src/features/ledger/types.ts` (`paidByCard: boolean`), `src/features/ledger/components/history-list.tsx` (suffix `" · Paid by card"`), `src/features/ledger/components/recent-history.tsx`
- Test: `src/features/payments/components/pay-by-card.test.tsx`, `src/features/ledger/components/history-list.test.tsx` (extend), `src/features/notifications/links.test.ts` (extend)

**Interfaces:**
- Consumes: Task 3 service and actions and `CardPaymentState`; Task 2 `list_ledger_history.method`.
- Produces:
  - `<PayByCard childId kind id amountMinor currency split state />`
  - `<PaymentStatusNote state />`
  - `<AutoChargeToggle target on cardSaved />`
  - `<SavedCardPanel card />`

- [ ] **Step 1: Write failing tests:**
  - `pay-by-card.test.tsx`:
    - with `state.available` → a button named "Pay by card";
    - with `unavailableReason: "too_small"` → disabled, with the text "Too small to pay by card";
    - with `state.pending` → "Card payment in progress";
    - with `lastOutcome.status: "succeeded_unapplied"` → "Paid by card after it was already handed over. Refund it from the provider's dashboard.";
    - with `lastOutcome.status: "failed"` → "Card payment didn't go through".
  - `history-list.test.tsx`: an item with `paidByCard: true` renders "· Paid by card"; without it, no suffix.
  - `links.test.ts`: `noticeText({ kind: "card_charge_failed", … }, "parent", "GBP")` → `"Card payment for <name>'s allowance didn't go through. Hand it over another way."`; `noticeHref` → the handover screen.
  - Mandate copy, shown before saving a card in `auto-charge-toggle.tsx`, asserted verbatim: "Jarso will charge this card the allowance or gift amount on the day it's due, until you turn auto charge off."
- [ ] **Step 2: Run** `pnpm vitest run src/features/payments/components src/features/ledger src/features/notifications`. Expected: FAIL.
- [ ] **Step 3: Implement** following `docs/design.md`, existing primitives from `@/components/ui`, and the `?card=returned` banner "Payment received, updating the jars…". The handover page reads `getCardPaymentState` inside the existing Suspense boundary. When `paymentsEnabled()` is false, nothing renders.
- [ ] **Step 4: Run** `pnpm check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(payments): pay by card, auto charge toggle and saved card screens`. Commit the history and notice changes separately: `feat(ledger): show paid by card in history`.

---

### Task 7: Fake hosted checkout and end-to-end test

**Files:**
- Create: `src/app/dev/payments/fake/page.tsx` (routing only), `src/features/payments/components/fake-checkout.tsx`, `src/features/payments/server/fake-checkout.ts` (server action `completeFakeCheckoutAction`), `tests/e2e/payments.spec.ts`
- Modify: `playwright.config.ts` (the web server env adds `PAYMENTS_PROVIDER=fake`, `PAYMENTS_ALLOW_FAKE=true`, `CRON_SECRET=e2e-cron-secret-0000`)

**Interfaces:**
- Consumes: Task 1 `FAKE_METHODS`, `paymentProviderName`. Task 4 `handleProviderEvent`. Task 5 cron route.
- Produces: page `/dev/payments/fake?mode=payment|setup&ref=…&success=…&cancel=…`.
  - `notFound()` unless `paymentProviderName() === "fake"`.
  - Buttons: "Pay" / "Fail" for payment mode; "Save card that works", "Save card that declines" (`fake_pm_decline`) and "Cancel" for setup mode.
  - The action builds the `ProviderEvent`, calls `handleProviderEvent("fake", event)`, then redirects to `success`.

- [ ] **Step 1: Write `payments.spec.ts`**, building the family through the API (`parentClient()` / `addChild()` / `dueOccurrence()` pattern from `tests/e2e/handover-race.spec.ts`):
  - **Manual:** open the handover screen, tap "Pay by card", then "Pay" on the fake page; expect "Payment received". Reload: the child's Spend + Save balances increase by the allowance and the parent's history shows "Paid by card".
  - **Cash after pending:** start a card payment, go back, hand over cash. Then complete the fake payment; expect the "already handed over" note, with balances increased once.
  - **Auto charge:** turn on the toggle, save a working card, make an occurrence due after the toggle time, `POST /api/cron/payments/auto-charge` with the bearer; expect the jars to update.
  - **Decline:** the same with a declining card; expect a "Card payment … didn't go through" notice in the parent's inbox, and the item still due.
- [ ] **Step 2: Run** `pnpm test:e2e tests/e2e/payments.spec.ts`. Expected: FAIL before the page exists.
- [ ] **Step 3: Implement** the page, component and action.
- [ ] **Step 4: Run** `pnpm test:e2e tests/e2e/payments.spec.ts && pnpm build`. Expected: PASS.
- [ ] **Step 5: Commit** `test(payments): end-to-end card handover with the fake provider`

---

### Task 8: Docs, ADR and verification

**Files:**
- Create: `docs/adr/0012-card-handover-payment-providers.md`
- Modify: `docs/domain.md`, `docs/database.md`, `docs/api.md` (the webhook route; replace "There is no `/api/cron` route yet" at line 12), `docs/architecture.md` (`@/lib/payments` entry point; payments module), `docs/conventions.md` (add `@/lib/payments` to the direct-import exceptions), `CLAUDE.md` hard rule 3 (same exception), `docs/deploy.md` (Stripe keys in Vercel, the webhook endpoint `/api/v1/payments/webhooks/stripe` with the events from spec §7, the Vault secrets `app_url` and `cron_secret`, `stripe listen --forward-to localhost:3000/api/v1/payments/webhooks/stripe`, the test cards), `docs/security.md` (Stripe keys and `CRON_SECRET` in the rotation runbook), `REQUIREMENTS.md` (an FR01 note: card handover is a test-mode showcase; real payments are still out of the pilot), `docs/roadmap.md`, `docs/fr-audit.md`

- [ ] **Step 1:** Write the ADR (context, decision: provider interface in `src/lib/payments`, Stripe first, test mode only; consequences; the "adding a provider" checklist from spec §8) and update the docs above.
- [ ] **Step 2: Run** the `verify` skill (`pnpm check`, `pnpm build`, `pnpm db:reset && pnpm db:test`, `pnpm test:e2e`). Expected: all green; record the results in the PR description.
- [ ] **Step 3: Manual pass** against real Stripe test mode with `stripe listen`: `4242 4242 4242 4242` succeeds; `4000 0000 0000 0341` saves, then auto charge fails and a notice arrives.
- [ ] **Step 4: Commit** `docs(payments): ADR 0012, deploy and API docs for card handover`, including `.claude-logs/`.
