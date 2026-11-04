import type Stripe from "stripe";
import type { FailureCode, ProviderEvent } from "../types";

export function mapFailureCode(code?: string | null, declineCode?: string | null): FailureCode {
  if (code === "authentication_required") return "authentication_required";
  if (code === "expired_card") return "expired_card";
  if (code === "card_declined")
    return declineCode === "insufficient_funds" ? declineCode : "declined";
  return "other";
}

/** Set on PaymentIntents and SetupIntents made for the phone's native sheet. */
function isInApp(metadata: Stripe.Metadata | null | undefined): boolean {
  return metadata?.jarsoInApp === "1";
}

/** The saved card from a SetupIntent (retrieved with its payment method expanded). */
function setupFromIntent(
  eventId: string,
  setupId: string,
  intent: Stripe.SetupIntent,
): ProviderEvent {
  const method = intent.payment_method;
  if (intent.status !== "succeeded" || !method || typeof method === "string" || !method.card) {
    return { kind: "setup_failed", eventId, setupId, reason: "failed" };
  }
  return {
    kind: "setup",
    eventId,
    setupId,
    methodRef: method.id,
    card: { brand: method.card.brand, last4: method.card.last4 },
  };
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
        return setupFromIntent(eventId, ref, await retrieveSetupIntent(setupIntentId));
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

    // An in-app intent stays live on a decline or a 3-D Secure step: the parent retries in the
    // sheet. Only an off-session auto charge ends on these.
    case "payment_intent.payment_failed": {
      const intent = event.data.object;
      const paymentId = intent.metadata?.paymentId;
      if (!paymentId || isInApp(intent.metadata)) return null;
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
      if (!paymentId || isInApp(intent.metadata)) return null;
      return {
        kind: "payment",
        eventId,
        paymentId,
        providerRef: intent.id,
        status: "failed",
        failureCode: "authentication_required",
      };
    }

    // Jarso cancels an in-app intent when its payment expires or the parent cancels it.
    case "payment_intent.canceled": {
      const intent = event.data.object;
      const paymentId = intent.metadata?.paymentId;
      if (!paymentId || !isInApp(intent.metadata)) return null;
      return { kind: "payment", eventId, paymentId, providerRef: intent.id, status: "canceled" };
    }

    // A card saved in the phone's sheet. A hosted setup's SetupIntent also carries setupId but
    // settles through checkout.session.completed, so only the in-app marker counts here.
    case "setup_intent.succeeded": {
      const intent = event.data.object;
      const setupId = intent.metadata?.setupId;
      if (!setupId || !isInApp(intent.metadata)) return null;
      return setupFromIntent(eventId, setupId, await retrieveSetupIntent(intent.id));
    }

    // The parent can try another card in the same sheet.
    case "setup_intent.setup_failed":
      return null;

    default:
      return null;
  }
}
