import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "../../errors";
import type { PaymentProvider, ProviderEvent } from "../types";

// The fake only runs off production behind two opt-ins, so a constant secret is fine.
const FAKE_SECRET = "jarso-fake-payments";

export const FAKE_SIGNATURE_HEADER = "x-fake-signature";

/** Saved-method refs the fake understands; the ref decides how a charge turns out. */
export const FAKE_METHODS = {
  ok: "fake_pm_ok",
  decline: "fake_pm_decline",
  auth: "fake_pm_auth",
} as const;

export function signFakeWebhook(body: string): string {
  return createHmac("sha256", FAKE_SECRET).update(body).digest("hex");
}

function validSignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signFakeWebhook(body));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function hostedUrl(
  base: string,
  mode: "payment" | "setup",
  ref: string,
  successUrl: string,
  cancelUrl: string,
) {
  return `${base}?mode=${mode}&ref=${encodeURIComponent(ref)}&success=${encodeURIComponent(successUrl)}&cancel=${encodeURIComponent(cancelUrl)}`;
}

/** A deterministic stand-in for the card processor, for tests and e2e runs. */
export function createFakePaymentProvider(opts: { hostedUrl: string }): PaymentProvider {
  return {
    id: "fake",

    minimumChargeMinor: (currency) => (/^[A-Z]{3}$/.test(currency) ? 1 : null),

    async ensureCustomer({ parentId }) {
      return { customerRef: `fake_cus_${parentId}` };
    },

    async createHostedPayment(i) {
      return {
        redirectUrl: hostedUrl(opts.hostedUrl, "payment", i.paymentId, i.successUrl, i.cancelUrl),
        providerRef: `fake_cs_${i.paymentId}`,
      };
    },

    async createHostedSetup(i) {
      return {
        redirectUrl: hostedUrl(opts.hostedUrl, "setup", i.setupId, i.successUrl, i.cancelUrl),
        providerRef: `fake_seti_${i.setupId}`,
      };
    },

    async chargeSaved(i) {
      const providerRef = `fake_pi_${i.paymentId}`;
      if (i.methodRef === FAKE_METHODS.decline) {
        return { providerRef, status: "failed", failureCode: "declined" };
      }
      if (i.methodRef === FAKE_METHODS.auth) {
        return { providerRef, status: "failed", failureCode: "authentication_required" };
      }
      return { providerRef, status: "succeeded" };
    },

    async detachMethod() {},

    async parseWebhook(rawBody, headers) {
      if (!validSignature(rawBody, headers.get(FAKE_SIGNATURE_HEADER))) {
        throw new AppError("VALIDATION", "Invalid webhook signature.");
      }
      try {
        return JSON.parse(rawBody) as ProviderEvent;
      } catch (cause) {
        throw new AppError("VALIDATION", "Invalid webhook body.", { cause });
      }
    },
  };
}
