import { AppError } from "@jarso/core/lib";
import Stripe from "stripe";
import { logger } from "../../logger";
import type { FailureCode, InAppSheet, PaymentProvider, PaymentStatus } from "../types";
import { stripeMinimumChargeMinor } from "./currencies";
import { mapFailureCode, mapStripeEvent } from "./map-event";

export const STRIPE_API_VERSION = "2026-10-28.endive";

function unavailable(cause: unknown): AppError {
  return new AppError(
    "UNAVAILABLE",
    "Card payments aren't available right now. You can still hand over cash.",
    {
      cause,
    },
  );
}

/** Stripe SDK errors that mean "could not reach or use Stripe" become UNAVAILABLE. */
function toAppError(cause: unknown): AppError {
  if (cause instanceof AppError) return cause;
  logger.error("stripe call failed", { type: (cause as { type?: string } | null)?.type });
  return unavailable(cause);
}

// paymentCopy.inProgress / badReturn: lib can't import a feature's copy, so the words are here.
const IN_PROGRESS = "A card payment is already in progress. Give it a minute and try again.";
const TRY_AGAIN = "Something went wrong. Please try again.";

export function createStripePaymentProvider(opts: {
  secretKey: string;
  webhookSecret: string;
  /** Opens the phone's PaymentSheet. Null: Stripe is web-only (`inApp` false). */
  publishableKey: string | null;
  client?: Stripe;
}): PaymentProvider {
  const client =
    opts.client ??
    new Stripe(opts.secretKey, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 1,
      timeout: 8000,
    });
  const publishableKey = opts.publishableKey;

  function requirePublishableKey(): string {
    if (publishableKey === null) throw unavailable(new Error("No Stripe publishable key"));
    return publishableKey;
  }

  /** The PaymentSheet params, with an ephemeral key minted for this open (it is short-lived). */
  async function paymentSheet(
    key: string,
    mode: "payment" | "setup",
    customerId: string,
    clientSecret: string,
  ): Promise<InAppSheet> {
    const ephemeral = await client.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: STRIPE_API_VERSION },
    );
    if (!ephemeral.secret) throw new Error("Ephemeral key has no secret");
    return {
      provider: "stripe",
      mode,
      publishableKey: key,
      customerId,
      ephemeralKey: ephemeral.secret,
      clientSecret,
    };
  }

  return {
    id: "stripe",
    label: "Stripe",
    autoChargeSettleMinutes: 30,
    setupNeedsContact: false,

    minimumChargeMinor: stripeMinimumChargeMinor,

    async ensureCustomer({ parentId, email }) {
      try {
        const customer = await client.customers.create(
          { email: email ?? undefined, metadata: { parentId } },
          { idempotencyKey: `customer:${parentId}` },
        );
        return { customerRef: customer.id };
      } catch (cause) {
        throw toAppError(cause);
      }
    },

    async createHostedPayment(i) {
      try {
        const session = await client.checkout.sessions.create(
          {
            mode: "payment",
            allowed_payment_method_types: ["card"],
            client_reference_id: i.paymentId,
            customer: i.customerRef,
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: i.currency.toLowerCase(),
                  unit_amount: i.amountMinor,
                  product_data: { name: i.description },
                },
              },
            ],
            success_url: i.successUrl,
            cancel_url: i.cancelUrl,
            expires_at: Math.floor(i.expiresAt.getTime() / 1000),
          },
          { idempotencyKey: `pay:${i.paymentId}` },
        );
        if (!session.url) throw new Error("Checkout Session has no url");
        return { redirectUrl: session.url, providerRef: session.id };
      } catch (cause) {
        throw toAppError(cause);
      }
    },

    async createHostedSetup(i) {
      try {
        const session = await client.checkout.sessions.create(
          {
            mode: "setup",
            allowed_payment_method_types: ["card"],
            client_reference_id: i.setupId,
            customer: i.customerRef,
            setup_intent_data: { metadata: { setupId: i.setupId } },
            success_url: i.successUrl,
            cancel_url: i.cancelUrl,
          },
          { idempotencyKey: `setup:${i.setupId}` },
        );
        if (!session.url) throw new Error("Checkout Session has no url");
        return { redirectUrl: session.url, providerRef: session.id };
      } catch (cause) {
        throw toAppError(cause);
      }
    },

    async chargeSaved(i) {
      try {
        const intent = await client.paymentIntents.create(
          {
            amount: i.amountMinor,
            currency: i.currency.toLowerCase(),
            customer: i.customerRef,
            payment_method: i.methodRef,
            off_session: true,
            confirm: true,
            description: i.description,
            metadata: { paymentId: i.paymentId },
          },
          { idempotencyKey: `charge:${i.paymentId}` },
        );
        if (intent.status === "succeeded") return { providerRef: intent.id, status: "succeeded" };
        if (intent.status === "processing") return { providerRef: intent.id, status: "pending" };
        if (intent.status === "requires_action") {
          return {
            providerRef: intent.id,
            status: "failed",
            failureCode: "authentication_required",
          };
        }
        return { providerRef: intent.id, status: "failed", failureCode: "other" };
      } catch (cause) {
        if (cause instanceof Stripe.errors.StripeCardError) {
          const status: PaymentStatus = "failed";
          const failureCode: FailureCode = mapFailureCode(cause.code, cause.decline_code);
          const intent = cause.payment_intent;
          return { providerRef: intent?.id ?? `charge:${i.paymentId}`, status, failureCode };
        }
        throw toAppError(cause);
      }
    },

    async detachMethod(methodRef) {
      try {
        await client.paymentMethods.detach(methodRef);
      } catch (cause) {
        if ((cause as { code?: string } | null)?.code === "resource_missing") return;
        throw toAppError(cause);
      }
    },

    inApp: publishableKey !== null,

    async createInAppPayment(i) {
      const key = requirePublishableKey();
      try {
        const intent = await client.paymentIntents.create(
          {
            amount: i.amountMinor,
            currency: i.currency.toLowerCase(),
            customer: i.customerRef,
            allowed_payment_method_types: ["card"],
            description: i.description,
            // The marker tells the webhook mapping the parent may retry in the sheet.
            metadata: { paymentId: i.paymentId, jarsoInApp: "1" },
          },
          { idempotencyKey: `inapp:${i.paymentId}` },
        );
        if (!intent.client_secret) throw new Error("PaymentIntent has no client secret");
        const sheet = await paymentSheet(key, "payment", i.customerRef, intent.client_secret);
        return { providerRef: intent.id, sheet };
      } catch (cause) {
        throw toAppError(cause);
      }
    },

    async resumeInAppPayment(i) {
      const key = requirePublishableKey();
      let intent: Stripe.PaymentIntent;
      try {
        intent = await client.paymentIntents.retrieve(i.providerRef);
      } catch (cause) {
        throw toAppError(cause);
      }
      if (intent.status === "succeeded" || intent.status === "processing") {
        throw new AppError("CONFLICT", IN_PROGRESS);
      }
      if (intent.status === "canceled" || !intent.client_secret) {
        throw new AppError("CONFLICT", TRY_AGAIN);
      }
      try {
        return await paymentSheet(key, "payment", i.customerRef, intent.client_secret);
      } catch (cause) {
        throw toAppError(cause);
      }
    },

    async cancelInAppPayment(providerRef) {
      try {
        await client.paymentIntents.cancel(providerRef);
      } catch (cause) {
        const code = (cause as { code?: string } | null)?.code;
        if (
          cause instanceof Stripe.errors.StripeInvalidRequestError &&
          (code === "payment_intent_unexpected_state" || code === "resource_missing")
        ) {
          // Already succeeded, cancelled or gone: a success still posts through the webhook.
          logger.warn("stripe intent not cancellable", { providerRef, code });
          return;
        }
        throw toAppError(cause);
      }
    },
    cancelsInApp: true,

    async createInAppSetup(i) {
      const key = requirePublishableKey();
      try {
        const intent = await client.setupIntents.create(
          {
            customer: i.customerRef,
            allowed_payment_method_types: ["card"],
            usage: "off_session",
            metadata: { setupId: i.setupId, jarsoInApp: "1" },
          },
          { idempotencyKey: `inapp-setup:${i.setupId}` },
        );
        if (!intent.client_secret) throw new Error("SetupIntent has no client secret");
        const sheet = await paymentSheet(key, "setup", i.customerRef, intent.client_secret);
        return { providerRef: intent.id, sheet };
      } catch (cause) {
        throw toAppError(cause);
      }
    },

    async parseWebhook(rawBody, headers) {
      const signature = headers.get("stripe-signature");
      let event: Stripe.Event;
      try {
        if (!signature) throw new Error("missing signature");
        event = client.webhooks.constructEvent(rawBody, signature, opts.webhookSecret);
      } catch (cause) {
        throw new AppError("VALIDATION", "Invalid webhook signature.", { cause });
      }
      if (event.livemode) {
        throw new AppError("VALIDATION", "Live-mode events are not accepted.");
      }
      try {
        return await mapStripeEvent(event, (id) =>
          client.setupIntents.retrieve(id, { expand: ["payment_method"] }),
        );
      } catch (cause) {
        throw toAppError(cause);
      }
    },
  };
}
