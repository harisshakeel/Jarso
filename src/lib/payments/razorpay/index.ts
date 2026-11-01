import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import type { PaymentLinks } from "razorpay/dist/types/paymentLink";
import { AppError } from "../../errors";
import { logger } from "../../logger";
import type { PaymentProvider } from "../types";
import { razorpayMinimumChargeMinor } from "./currencies";
import { isLiveModeEvent, mapRazorpayEvent, type RazorpayEvent } from "./map-event";

export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";
export const RAZORPAY_EVENT_ID_HEADER = "x-razorpay-event-id";

/** The SDK has no timeout option, so each call races this deadline. */
const TIMEOUT_MS = 8000;

/** Card only on the hosted Payment Link page. */
const CARD_ONLY = {
  card: true,
  netbanking: false,
  upi: false,
  wallet: false,
  emi: false,
  paylater: false,
};

/** What the SDK throws for an HTTP error response (see razorpay/dist/api.js normalizeError). */
type RazorpaySdkError = {
  statusCode: number | string;
  error?: { code?: string; description?: string; reason?: string };
};

function isRazorpaySdkError(cause: unknown): cause is RazorpaySdkError {
  return typeof cause === "object" && cause !== null && "statusCode" in cause;
}

function unavailable(cause?: unknown): AppError {
  return new AppError(
    "UNAVAILABLE",
    "Card payments aren't available right now. You can still hand over cash.",
    { cause },
  );
}

/**
 * Any failure to reach or use Razorpay becomes UNAVAILABLE: network errors and timeouts, 5xx, and
 * the 4xx this adapter can't recover from (a duplicate payment link reference id among them).
 * Logs Razorpay's code and reason only: its description can echo input (an email, an id).
 */
function toAppError(op: string, cause: unknown): AppError {
  if (cause instanceof AppError) return cause;
  if (isRazorpaySdkError(cause)) {
    logger.error("razorpay call failed", {
      op,
      status: Number(cause.statusCode),
      code: cause.error?.code,
      reason: cause.error?.reason,
    });
    return unavailable({ status: Number(cause.statusCode), code: cause.error?.code });
  }
  // A network failure reaches us as a TypeError: the SDK reads err.response.status of undefined.
  const reason =
    (cause as { name?: string } | null)?.name === "TimeoutError" ? "timeout" : "network";
  logger.error("razorpay call failed", { op, reason });
  return unavailable(cause);
}

/** Runs one SDK call under the deadline, mapping any failure. No retries: no idempotency header. */
async function call<T>(op: string, run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DOMException("Razorpay call timed out", "TimeoutError")),
      TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([run(), deadline]);
  } catch (cause) {
    throw toAppError(op, cause);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The SDK's own `validateWebhookSignature` compares with `===`, which leaks timing, so the check
 * is done here with `timingSafeEqual` on equal-length buffers.
 */
function validSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function createRazorpayPaymentProvider(opts: {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  /** Jarso's save-card page that opens Razorpay Checkout (used by saved cards). */
  checkoutUrl: string;
  client?: Razorpay;
}): PaymentProvider {
  const client = opts.client ?? new Razorpay({ key_id: opts.keyId, key_secret: opts.keySecret });

  return {
    id: "razorpay",
    label: "Razorpay",
    // The bank notifies the cardholder about 36 h before a repeat debit (spec D4).
    autoChargeSettleMinutes: 4320,

    minimumChargeMinor: razorpayMinimumChargeMinor,

    async ensureCustomer({ parentId, email }) {
      // fail_existing 0 hands back the existing customer instead of erroring.
      const customer = await call("customers.create", () =>
        client.customers.create({
          name: "Jarso parent",
          ...(email ? { email } : {}),
          fail_existing: 0,
          notes: { parentId },
        }),
      );
      if (!customer.id) throw unavailable(new Error("Razorpay customer has no id"));
      return { customerRef: customer.id };
    },

    async createHostedPayment(i) {
      // The SDK's types require `customer`, which the API does not; Jarso sends none.
      const body: Omit<PaymentLinks.RazorpayPaymentLinkAdvanceOption, "customer"> = {
        amount: i.amountMinor,
        currency: i.currency.toUpperCase(),
        accept_partial: false,
        description: i.description,
        reference_id: i.paymentId,
        expire_by: Math.floor(i.expiresAt.getTime() / 1000),
        notify: { sms: false, email: false },
        reminder_enable: false,
        callback_url: i.successUrl,
        callback_method: "get",
        options: { checkout: { method: CARD_ONLY } },
      };
      // cancelUrl is unused: a Payment Link has no cancel redirect; an abandoned link expires.
      const link = await call("paymentLink.create", () =>
        client.paymentLink.create(body as PaymentLinks.RazorpayPaymentLinkAdvanceOption),
      );
      const { id, short_url } = link as { id?: string; short_url?: string };
      if (!id || !short_url) throw unavailable(new Error("Razorpay payment link has no url"));
      return { redirectUrl: short_url, providerRef: id };
    },

    // Saved cards and auto charge arrive with the save-card page.
    async createHostedSetup() {
      throw unavailable();
    },

    async chargeSaved() {
      throw unavailable();
    },

    async detachMethod() {
      throw unavailable();
    },

    async parseWebhook(rawBody, headers) {
      if (!validSignature(rawBody, headers.get(RAZORPAY_SIGNATURE_HEADER), opts.webhookSecret)) {
        throw new AppError("VALIDATION", "Invalid webhook signature.");
      }
      const eventId = headers.get(RAZORPAY_EVENT_ID_HEADER);
      if (!eventId) throw new AppError("VALIDATION", "Missing webhook event id.");
      let event: RazorpayEvent;
      try {
        event = JSON.parse(rawBody) as RazorpayEvent;
      } catch (cause) {
        throw new AppError("VALIDATION", "Invalid webhook body.", { cause });
      }
      if (!event || typeof event !== "object" || typeof event.event !== "string") {
        throw new AppError("VALIDATION", "Invalid webhook body.");
      }
      if (isLiveModeEvent(event)) {
        throw new AppError("VALIDATION", "Live-mode events are not accepted.");
      }
      return mapRazorpayEvent(event, eventId);
    },
  };
}
