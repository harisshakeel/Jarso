import type Stripe from "stripe";
import type { FailureCode, ProviderEvent } from "../types";

export function mapFailureCode(code?: string | null, declineCode?: string | null): FailureCode {
  if (code === "authentication_required") return "authentication_required";
  if (code === "expired_card") return "expired_card";
  if (code === "card_declined")
    return declineCode === "insufficient_funds" ? declineCode : "declined";
  return "other";
}

/**
 * Maps a Stripe event to ours, or null for events we do not act on. Payments are matched by the
 * paymentId we put on the Checkout Session (client_reference_id) or the PaymentIntent (metadata).
 */
export async function mapStripeEvent(
  event: Stripe.Event,
  retrieveSetupIntent: (id: string) => Promise<Stripe.SetupIntent>,
): Promise<ProviderEvent | null> {
  const eventId = event.id;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const ref = session.client_reference_id;
      if (!ref) return null;
      if (session.mode === "payment") {
        if (session.payment_status !== "paid") return null;
        return {
          kind: "payment",
          eventId,
          paymentId: ref,
          providerRef: session.id,
          status: "succeeded",
        };
      }
      if (session.mode === "setup") {
        const setupIntentId =
          typeof session.setup_intent === "string"
            ? session.setup_intent
            : session.setup_intent?.id;
        if (!setupIntentId) return null;
        const intent = await retrieveSetupIntent(setupIntentId);
        const method = intent.payment_method;
        if (
          intent.status !== "succeeded" ||
          !method ||
          typeof method === "string" ||
          !method.card
        ) {
          return { kind: "setup_failed", eventId, setupId: ref, reason: "failed" };
        }
        return {
          kind: "setup",
          eventId,
          setupId: ref,
          methodRef: method.id,
          card: { brand: method.card.brand, last4: method.card.last4 },
        };
      }
      return null;
    }

    // Delayed payment methods. Card Checkout settles at once, but Stripe may send these.
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object;
      const ref = session.client_reference_id;
      if (!ref || session.mode !== "payment") return null;
      const succeeded = event.type === "checkout.session.async_payment_succeeded";
      return {
        kind: "payment",
        eventId,
        paymentId: ref,
        providerRef: session.id,
        status: succeeded ? "succeeded" : "failed",
        ...(succeeded ? {} : { failureCode: "other" as const }),
      };
    }

    case "checkout.session.expired": {
      const session = event.data.object;
      const ref = session.client_reference_id;
      if (!ref) return null;
      if (session.mode === "payment") {
        return {
          kind: "payment",
          eventId,
          paymentId: ref,
          providerRef: session.id,
          status: "expired",
        };
      }
      if (session.mode === "setup") {
        return { kind: "setup_failed", eventId, setupId: ref, reason: "expired" };
      }
      return null;
    }

    case "payment_intent.succeeded": {
      const intent = event.data.object;
      const paymentId = intent.metadata?.paymentId;
      if (!paymentId) return null;
      return { kind: "payment", eventId, paymentId, providerRef: intent.id, status: "succeeded" };
    }

    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const paymentId = intent.metadata?.paymentId;
      if (!paymentId) return null;
      const error = intent.last_payment_error;
      return {
        kind: "payment",
        eventId,
        paymentId,
        providerRef: intent.id,
        status: "failed",
        failureCode: mapFailureCode(error?.code, error?.decline_code),
      };
    }

    case "payment_intent.requires_action": {
      const intent = event.data.object;
      const paymentId = intent.metadata?.paymentId;
      if (!paymentId) return null;
      return {
        kind: "payment",
        eventId,
        paymentId,
        providerRef: intent.id,
        status: "failed",
        failureCode: "authentication_required",
      };
    }

    default:
      return null;
  }
}
