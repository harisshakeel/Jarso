import Stripe from "stripe";
import { AppError } from "../../errors";
import { logger } from "../../logger";
import type { FailureCode, PaymentProvider, PaymentStatus } from "../types";
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

export function createStripePaymentProvider(opts: {
  secretKey: string;
  webhookSecret: string;
  client?: Stripe;
}): PaymentProvider {
  const client =
    opts.client ??
    new Stripe(opts.secretKey, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 1,
      timeout: 8000,
    });

  return {
    id: "stripe",

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
