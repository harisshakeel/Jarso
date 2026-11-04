# 0018. Card payments on the phone through the providers' native sheets

- Status: Accepted. Extends 0013 and 0014.
- Date: 2026-11-04

## Context

The web pays and saves cards on hosted pages: Stripe Checkout Sessions, Razorpay Payment Links and Jarso's own Razorpay Checkout page (ADR 0013, 0014). On the Android app a hosted page means leaving the app for a browser and finding the way back. Stripe's PaymentSheet and Razorpay Checkout run inside the app, but they need different server objects (a PaymentIntent or SetupIntent with an ephemeral key; an order) and their events differ from a Checkout Session's. The webhook must stay the only thing that marks a payment paid, and the phone must hold no secret.

## Decision

- **An in-app channel.** The provider contract (`packages/core/src/lib/payments-types.ts`) gains `createInAppPayment`, `resumeInAppPayment`, `cancelInAppPayment` and `createInAppSetup`, which return an `InAppSheet`: only public values (the Stripe publishable key or the Razorpay key id) plus short-lived ones (client secret, ephemeral key, order id). A provider with `inApp: false` shows no button on the phone; Stripe is in-app only when `STRIPE_PUBLISHABLE_KEY` is set.
- **Same rules as hosted.** `startInAppPayment` reuses the hosted flow's validation, one live payment per item, reuse, provider (and channel) switch and expiry. A payment row carries an `in_app` flag; Jarso never stores the client secret or ephemeral key, it re-derives them (`resumeInAppPayment`) when the sheet reopens within the window.
- **Expiry is Jarso's.** PaymentIntents and orders have no provider expiry, so the payment's own `expires_at` (`CHECKOUT_MINUTES`) applies. Ending an in-app payment (expiry, the parent's Cancel, or a switch to the web's hosted checkout) also cancels its PaymentIntent at Stripe. Razorpay orders can't be cancelled; a late `order.paid` follows the existing "unapplied" path.
- **Webhook rules.** In-app PaymentIntents carry `metadata.jarsoInApp = "1"`: their `requires_action` and `payment_failed` events are ignored (3-D Secure or a first decline the parent retries in the same sheet); only success, cancel or expiry end them. Auto-charge intents are unchanged. `setup_intent.succeeded` saves a card from the phone. Razorpay in-app orders carry a `jarsoPay` note: `order.paid` succeeds the payment, `payment.failed` is ignored.
- **The phone only reads back.** After the sheet closes the app polls `GET /api/v1/payments/:id` until the status is final (every 2 s, every 5 s with "still confirming" after 15 s, for up to 2 minutes). It never calls anything that marks a payment paid and does not verify Razorpay's client-side signature. The `fake` provider's test-card dialog (dev builds only) goes through `POST /api/v1/payments/fake/complete`, the same `handleProviderEvent` path as the fake webhook, and is 404 wherever the fake provider is off.
- **Saving a card keeps the web's shape.** There is no standalone "save a card": turning auto charge on with no saved card answers the setup sheet's params, and the webhook arms the toggle once the card is saved.

## Consequences

- One payments service serves both channels; the bearer routes under `/api/v1/payments` are thin. The web's hosted flows are unchanged.
- Native modules (`@stripe/stripe-react-native`, `react-native-razorpay`) need a development build; Expo Go no longer runs the app.
- A sheet closed early leaves the payment pending until it is paid, cancelled or expires (31 minutes). A reopened handover screen offers Pay again (the same intent) but Cancel only in the session that started the payment, because the phone learns the payment id only from its own start.
- The Stripe dashboard webhook needs `payment_intent.canceled` and `setup_intent.succeeded` added.
