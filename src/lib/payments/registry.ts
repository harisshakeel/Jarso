import { clientEnv } from "@/config";
import { serverEnv } from "@/config/env.server";
import { logger } from "../logger";
import { createFakePaymentProvider } from "./fake";
import { createStripePaymentProvider } from "./stripe";
import type { PaymentProvider, PaymentProviderId } from "./types";

/**
 * Which provider is active, or null when payments are off or misconfigured. The fake needs
 * PAYMENTS_ALLOW_FAKE and is refused on Vercel production; Stripe needs both its env vars.
 */
export function paymentProviderName(): PaymentProviderId | null {
  if (serverEnv.PAYMENTS_PROVIDER === "fake") {
    return serverEnv.PAYMENTS_ALLOW_FAKE && serverEnv.VERCEL_ENV !== "production" ? "fake" : null;
  }
  if (serverEnv.PAYMENTS_PROVIDER === "stripe") {
    return serverEnv.STRIPE_SECRET_KEY && serverEnv.STRIPE_WEBHOOK_SECRET ? "stripe" : null;
  }
  return null;
}

let provider: PaymentProvider | null | undefined;

/** The provider for this server instance, created once. Null when payments are off. */
export function getPaymentProvider(): PaymentProvider | null {
  if (provider !== undefined) return provider;
  const name = paymentProviderName();
  if (serverEnv.PAYMENTS_PROVIDER === "stripe" && name === null) {
    // Once per server instance (the result is cached). Names the missing vars, never values.
    logger.warn("PAYMENTS_PROVIDER is stripe but its keys are missing, so card payments are off", {
      missing: [
        serverEnv.STRIPE_SECRET_KEY ? null : "STRIPE_SECRET_KEY",
        serverEnv.STRIPE_WEBHOOK_SECRET ? null : "STRIPE_WEBHOOK_SECRET",
      ].filter((key) => key !== null),
    });
  }
  provider =
    name === "fake"
      ? createFakePaymentProvider({
          hostedUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/dev/payments/fake`,
        })
      : name === "stripe" && serverEnv.STRIPE_SECRET_KEY && serverEnv.STRIPE_WEBHOOK_SECRET
        ? createStripePaymentProvider({
            secretKey: serverEnv.STRIPE_SECRET_KEY,
            webhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET,
          })
        : null;
  return provider;
}

/** The active provider, only when its id matches (a stored payment names the provider it used). */
export function getPaymentProviderById(id: string): PaymentProvider | null {
  const active = getPaymentProvider();
  return active && active.id === id ? active : null;
}
