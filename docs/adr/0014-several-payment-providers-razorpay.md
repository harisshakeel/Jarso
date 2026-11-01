# 0014. Several payment providers at once, and Razorpay

- Status: Accepted
- Date: 2026-11-01

## Context

ADR 0013 shipped card handover with one provider per deployment, chosen by `PAYMENTS_PROVIDER`. The product owner wants Razorpay added and wants the parent to choose which provider pays, with several running side by side. Razorpay must support both paying now and a saved card for auto charge. Same limits as before: a test-mode showcase, no real money. Design: `docs/superpowers/specs/2026-11-01-multi-provider-razorpay-design.md`.

ADR 0013 also said adding a provider needs no migration. That was wrong: `provider` columns carry a check constraint listing the known providers, so each new provider widens it.

## Decision

- **`PAYMENTS_PROVIDER` is gone.** A provider is on when all of its env keys are set (Stripe: two, Razorpay: three). The fake is on when `PAYMENTS_ALLOW_FAKE=true` and `VERCEL_ENV` is not `production`. Several can be on at once. A provider with only some keys stays off, and the server logs once which variable names are missing (never values). Nothing on: payments are off, cash works as before.
- **The parent picks at checkout.** One card button per provider that can charge the family's currency: "Pay by card" when there is one, "Pay with {label}" when there are several. Saving a card also names a provider.
- **One saved card per parent per provider.** Each auto-charge toggle (`allowance_schedules`, `parent_gifts`) records its provider in `auto_charge_provider`; the database requires it exactly when `auto_charge` is on. `due_auto_charges` takes the list of providers that are on and returns each item's provider. Removing a card turns off only that provider's toggles.
- **Each provider declares `label` and `autoChargeSettleMinutes`.** The stale sweep expires a pending auto charge after that many minutes: 30 for Stripe and the fake, 4320 (72 h) for Razorpay.
- **Switching provider mid-checkout.** Starting a manual payment with provider B cancels a live, still `pending` manual checkout with provider A. One in `requires_action`, still opening, or an auto charge in flight is a CONFLICT. If A still completes, `apply_payment` posts it or marks it `succeeded_unapplied`, as before.
- **Razorpay, test mode only.** The official `razorpay` Node SDK, pinned at 2.9.8, injected as an optional client for tests; no automatic retries, about 8 s timeout. `RAZORPAY_KEY_ID` must match `^rzp_test_`; live-mode webhook payloads are rejected. INR only, minimum 1 rupee; other currencies show no Razorpay button. Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
  - Pay now: a card-only Payment Link.
  - Save card: a 1 rupee order with a card token, opened in Razorpay Checkout on a small Jarso page (`/parent/payments/razorpay`). Checkout collects phone and email itself; Jarso stores neither and the adapter reads them back from Razorpay when it charges. Checkout posts back to `POST /api/v1/payments/razorpay/return`.
  - Auto charge: an order plus a recurring payment with the saved token. The result arrives by webhook.
  - Webhook: `/api/v1/payments/webhooks/razorpay`, HMAC-SHA256 of the raw body in `x-razorpay-signature`, fails closed. Events: `payment_link.paid`, `payment_link.expired`, `payment_link.cancelled`, `order.paid`, `payment.failed`. Only server-set fields choose what an event settles: the Payment Link's `reference_id` and the order's notes. Payment notes are never trusted, because Checkout lets the browser set them, so an auto charge succeeds from `order.paid` only (`payment.captured` is not subscribed) and `payment.failed` is matched through its order, which the adapter fetches.
- **The return route is the one `withApi` route with `crossOrigin: true`.** Razorpay's site posts a form to it, so the same-origin guard cannot apply. It reads no session, writes nothing, and only answers 303 to same-origin URLs it rebuilds from validated parameters (anything else goes to `/parent`). The webhook, not this redirect, saves the card. The save-card page validates the same URLs, so neither is an open redirect.
- **New secrets in the repo's guards.** The Razorpay key id shape `rzp_(test|live)_…` is in gitleaks, `scripts/check-secrets.sh` and the session-log redaction. The key secret and webhook secret have no prefix, so no pattern can find them; they rely on never being typed anywhere (`docs/security.md`).
- **Adding a provider now takes a migration.** Updated checklist: the adapter folder, the id in `PaymentProviderId` and the Zod enum, one registry entry with its env keys, a migration widening every `provider` check, env vars in `env.server.ts` and `.env.example`, the webhook URL, the secret scanners, and the contract suite.

## Consequences

- Test, preview and production deployments can enable any mix. Turning a provider's keys off hides its buttons; its saved cards and toggles stay in the database with no screen to clear them until it is turned back on. `due_auto_charges` skips them, so nothing is charged.
- Known Razorpay limits, accepted for a showcase:
  - Recurring on cards must be enabled on the account by Razorpay support.
  - Test-mode card tokens last 3 days.
  - A repeat debit settles about 36 h after the charge starts (the bank notifies the cardholder first), so an auto-charged allowance lands about a day and a half after its due day, and the item shows "card payment in progress" meanwhile.
  - A deterministic charge failure (bad saved-card data, missing email or contact at Razorpay) reaches the parent only when the 72 h window expires.
  - `token.confirmed` can arrive 36 to 72 h after saving. The card counts as saved on `order.paid`; a later failure notifies the parent as usual.
  - Charges above 15,000 rupees need extra cardholder authentication; the token's maximum is 15,000.
  - The 1 rupee save-card authorisation is captured and not refunded.
- Three more secrets join the rotation runbook in `docs/security.md`.
- Real money still needs the decisions ADR 0013 lists.
