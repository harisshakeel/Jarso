import { clientEnv } from "@/config";
import { serverEnv } from "@/config/env.server";
import { logger } from "../logger";
import { createFakePaymentProvider } from "./fake";
import { createRazorpayPaymentProvider } from "./razorpay";
import { createStripePaymentProvider } from "./stripe";
import type { PaymentProvider, PaymentProviderId } from "./types";

type Entry = {
  id: PaymentProviderId;
  /** Env var names this provider needs, by name only (never values). */
  keys: Record<string, string | undefined>;
  /** Extra gate beyond the keys (the fake's opt-in). */
  allowed?: () => boolean;
  create: () => PaymentProvider;
};

/**
 * Every provider Jarso knows, in the order the parent sees them. A provider is on when all its
 * keys are set (and its gate passes); several can be on at once.
 */
function entries(): Entry[] {
  return [
    {
      id: "stripe",
      keys: {
        STRIPE_SECRET_KEY: serverEnv.STRIPE_SECRET_KEY,
        STRIPE_WEBHOOK_SECRET: serverEnv.STRIPE_WEBHOOK_SECRET,
      },
      create: () =>
        createStripePaymentProvider({
          secretKey: serverEnv.STRIPE_SECRET_KEY ?? "",
          webhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET ?? "",
        }),
    },
    {
      id: "razorpay",
      keys: {
        RAZORPAY_KEY_ID: serverEnv.RAZORPAY_KEY_ID,
        RAZORPAY_KEY_SECRET: serverEnv.RAZORPAY_KEY_SECRET,
        RAZORPAY_WEBHOOK_SECRET: serverEnv.RAZORPAY_WEBHOOK_SECRET,
      },
      create: () =>
        createRazorpayPaymentProvider({
          keyId: serverEnv.RAZORPAY_KEY_ID ?? "",
          keySecret: serverEnv.RAZORPAY_KEY_SECRET ?? "",
          webhookSecret: serverEnv.RAZORPAY_WEBHOOK_SECRET ?? "",
          checkoutUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/parent/payments/razorpay`,
        }),
    },
    {
      id: "fake",
      keys: {},
      // Two opt-ins, never on Vercel production.
      allowed: () => serverEnv.PAYMENTS_ALLOW_FAKE && serverEnv.VERCEL_ENV !== "production",
      create: () =>
        createFakePaymentProvider({
          hostedUrl: `${clientEnv.NEXT_PUBLIC_APP_URL}/dev/payments/fake`,
        }),
    },
  ];
}

let providers: readonly PaymentProvider[] | undefined;

/**
 * The providers on for this server instance, created once. Empty when payments are off. A
 * provider with some but not all of its keys stays off and is logged once, naming the missing
 * vars, never their values.
 */
export function getPaymentProviders(): readonly PaymentProvider[] {
  if (providers !== undefined) return providers;
  const on: PaymentProvider[] = [];
  for (const entry of entries()) {
    const names = Object.keys(entry.keys);
    const missing = names.filter((name) => !entry.keys[name]);
    if (missing.length > 0) {
      if (missing.length < names.length) {
        logger.warn(`${entry.id} payment keys are incomplete, so it stays off`, {
          provider: entry.id,
          missing,
        });
      }
      continue;
    }
    if (entry.allowed && !entry.allowed()) continue;
    on.push(entry.create());
  }
  providers = on;
  return providers;
}

/** Whether any card provider is on. */
export function paymentsEnabled(): boolean {
  return getPaymentProviders().length > 0;
}

/** The provider with this id when it is on, else null (a stored row names the one it used). */
export function getPaymentProviderById(id: string): PaymentProvider | null {
  return getPaymentProviders().find((provider) => provider.id === id) ?? null;
}

/**
 * The key id Razorpay Checkout opens with, while Razorpay is on, else null. Public by design
 * (Checkout runs in the browser), but served by the save-card page rather than a NEXT_PUBLIC_
 * var so it stays with the other Razorpay keys.
 */
export function razorpayCheckoutKeyId(): string | null {
  if (!getPaymentProviderById("razorpay")) return null;
  return serverEnv.RAZORPAY_KEY_ID ?? null;
}
