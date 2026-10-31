# 0012. Card handover through payment providers: one interface, Stripe test mode first

- Status: Accepted
- Date: 2026-10-31

## Context

A handover is cash today: the parent hands over money and records it. The product owner wants the demo to show real payment rails: a parent pays a due allowance or one-time gift by card and the money lands in the child's Spend and Save jars. A parent can also turn on auto charge, so a saved card pays when the item falls due. `REQUIREMENTS.md` keeps real payments out of the pilot, so this is a test-mode showcase behind configuration. More providers (Razorpay, Adyen, Mollie, PayPal) are likely, and each must be cheap to add. Design: `docs/superpowers/specs/2026-10-31-stripe-card-handover-design.md`.

The failures that matter most: money posting twice (webhook retry, double click, auto charge racing a manual payment, overlapping cron runs), a card number reaching Jarso, a key in the repo or a log, a child seeing card details or a failed charge, and cash handover breaking when the provider is down.

## Decision

- **A provider interface in `src/lib/payments`.** A server-only entry point (`import "server-only"`), imported directly as `@/lib/payments` and not re-exported from `@/lib`. It holds the `PaymentProvider` interface (customer, hosted payment, hosted setup, off-session charge, detach, webhook parsing, minimum charge), a registry, the Stripe adapter, a fake adapter and a contract test suite. It has no domain code and no database access. Domain code in `src/features/payments` sees only the interface, `ProviderEvent` and opaque `*_ref` strings. Stripe types and IDs never leave `src/lib/payments/stripe/`.
- **Our IDs go out, provider IDs come back.** Every call carries our own `paymentId` or `setupId`, which the adapter puts where the provider echoes it back and also uses as the idempotency key (`customer:`, `pay:`, `setup:`, `charge:` plus our id). The adapter verifies signatures and maps events and errors; adapters throw `AppError`, never raw SDK errors.
- **Stripe first, test mode only.** `stripe` 23.1.0, API version `2026-10-28.endive`, hosted Checkout limited to `card`. `STRIPE_SECRET_KEY` must match `^(sk|rk)_test_`, and webhook events with `livemode: true` are rejected. No live mode, no real money.
- **One active provider per deployment.** `PAYMENTS_PROVIDER` is `none | stripe | fake`, default `none`. `none` means nothing renders, the payment routes return 404 and cash works as before. `fake` is for tests and local runs: it needs `PAYMENTS_ALLOW_FAKE=true` and is refused on `VERCEL_ENV=production`. Rows carry `provider`, so a second provider can run later.
- **The webhook is the source of truth; the redirect never posts money.** `POST /api/v1/payments/webhooks/[provider]` verifies the event and calls `handleProviderEvent`. A forward-only status machine (`status.ts`) plus the `payment_webhook_events` primary key make duplicates and out-of-order events harmless. Posting goes through the `apply_payment` database function (service role only), which takes the same locks in the same order as the cash confirm functions, so cash and card serialise. The ledger keys are unchanged (`occurrence:<id>:spend|save`, `parent_gift:<id>:spend|save`) and `ledger_entries.method` (`cash` default, `card`) is the only ledger change. A card payment that lands after the item was already handed over, closed or cancelled becomes `succeeded_unapplied` and posts nothing; the parent sees a refund note.
- **Auto charge is one attempt per item.** Toggles live on `allowance_schedules` and `parent_gifts` (`auto_charge`, `auto_charge_by`, `auto_charge_since`). Only items due after the toggle was turned on qualify. A partial unique index allows one `auto` payment row per source, ever, so overlapping runs cannot double charge. An auto attempt that ends failed or expired keeps the item due and sends the parent `card_charge_failed`. Pay by card and cash stay available.
- **Scheduling.** pg_cron job `charge-due-cards` at `9 * * * *` calls `/api/cron/payments/auto-charge` through pg_net, reading the Vault secrets `app_url` and `cron_secret` (created by hand per environment; `cron_secret` equals the app's `CRON_SECRET`). A daily Vercel Cron at `30 3 * * *` hits the same route as a fallback. The route needs `Authorization: Bearer <CRON_SECRET>` and returns 404 when `CRON_SECRET` is unset or payments are off. It is reconciliation-style, so a missed or doubled run is harmless.
- **Children see only "paid by card".** The history line reads `ledger_entries.method`. The child never sees payment state, card details or failures. Only the brand and last 4 of the card are stored.

## Consequences

- Adding a provider is one folder, one registry line and its env vars. No migration, no domain or UI change, no new route. Checklist:
  1. Add `src/lib/payments/<id>/` implementing `PaymentProvider` (hosted payment, hosted setup, off-session charge, webhook verification and mapping, currency minimums).
  2. Add `<id>` to `ProviderId` and one line in `src/lib/payments/registry.ts`.
  3. Add its env vars to `env.server.ts` and `.env.example`, required only when `PAYMENTS_PROVIDER=<id>`.
  4. Point the provider's webhooks at `/api/v1/payments/webhooks/<id>`.
  5. Run the shared adapter contract suite (`src/lib/payments/contract.test.ts`) and the domain tests, which use `fake`.
- Cash handover does not depend on the provider. If Stripe is down, card actions say so plainly and cash still works.
- Card always pays the item's full amount (no shortfall). Currencies Stripe treats as zero-decimal are unsupported until needed. A saved card per parent, one provider at a time.
- Real money needs more than a key swap: a new decision to leave test mode, live-mode webhooks, refunds and disputes, a legal review of the mandate wording for off-session charges, and the pilot's parental verification. Out of scope here.
- Two Stripe secrets (secret key, webhook secret) and `CRON_SECRET` (also stored as the Vault `cron_secret`) join the rotation runbook in `docs/security.md`.
- The cron and webhook routes are new unauthenticated-by-session entry points. Their protection is the signature check and the bearer secret; both fail closed.
