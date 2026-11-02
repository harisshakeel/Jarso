import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@jarso/core/lib";
import Razorpay from "razorpay";
import type { PaymentLinks } from "razorpay/dist/types/paymentLink";
import type { Tokens } from "razorpay/dist/types/tokens";
import { logger } from "../../logger";
import type { PaymentProvider } from "../types";
import { razorpayMinimumChargeMinor } from "./currencies";
import {
  failedPaymentOrderToFetch,
  isLiveModeEvent,
  mapRazorpayEvent,
  mapRazorpayFailureCode,
  type RazorpayEvent,
  type RazorpayOrder,
  setupCardToFetch,
} from "./map-event";

export const RAZORPAY_SIGNATURE_HEADER = "x-razorpay-signature";
export const RAZORPAY_EVENT_ID_HEADER = "x-razorpay-event-id";

/** The SDK has no timeout option, so each call races this deadline. */
const TIMEOUT_MS = 8000;

/** The save-card authorisation: ₹1, Razorpay's minimum. */
const SETUP_AMOUNT_MINOR = 100;
/** Repeat debits above ₹15,000 need the cardholder's extra check (spec §9). */
const TOKEN_MAX_AMOUNT_MINOR = 1_500_000;

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
  error?: {
    code?: string;
    description?: string;
    reason?: string;
    field?: string;
    source?: string;
  };
};

function isRazorpaySdkError(cause: unknown): cause is RazorpaySdkError {
  return typeof cause === "object" && cause !== null && "statusCode" in cause;
}

/** Error sources about the merchant account or Razorpay itself, not the customer or their card. */
const ACCOUNT_SOURCES = new Set(["internal", "razorpay", "business"]);

/**
 * What to log about a Razorpay error: always its source; its description only when the source is
 * the account or Razorpay (e.g. a feature not enabled), where it carries no customer data and is
 * the only clue an operator gets. Dropped anyway if it looks like it echoes an email or a number.
 */
function errorDetail(error: RazorpaySdkError["error"]): { source?: string; description?: string } {
  const source = error?.source;
  const description = error?.description;
  if (!source || !ACCOUNT_SOURCES.has(source) || !description) return { source };
  if (description.includes("@") || /\d{8,}/.test(description)) return { source };
  return { source, description: description.slice(0, 200) };
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
 * Logs Razorpay's code, reason and source; the description only for account-level errors
 * (`errorDetail`), since a customer-facing one can echo input (an email, an id).
 */
function toAppError(op: string, cause: unknown): AppError {
  if (cause instanceof AppError) return cause;
  if (isRazorpaySdkError(cause)) {
    logger.error("razorpay call failed", {
      op,
      status: Number(cause.statusCode),
      code: cause.error?.code,
      reason: cause.error?.reason,
      ...errorDetail(cause.error),
    });
    return unavailable({ status: Number(cause.statusCode), code: cause.error?.code });
  }
  // A network failure reaches us as a TypeError: the SDK reads err.response.status of undefined.
  const reason =
    (cause as { name?: string } | null)?.name === "TimeoutError" ? "timeout" : "network";
  logger.error("razorpay call failed", { op, reason });
  return unavailable(cause);
}

/** Races one SDK call against the deadline; the raw failure is the caller's to map. */
async function withDeadline<T>(run: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DOMException("Razorpay call timed out", "TimeoutError")),
      TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([run(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs one SDK call under the deadline, mapping any failure. No retries: no idempotency header. */
async function call<T>(op: string, run: () => Promise<T>): Promise<T> {
  try {
    return await withDeadline(run);
  } catch (cause) {
    throw toAppError(op, cause);
  }
}

/** The input field a refused customer email or phone maps to, and its plain copy. */
const CONTACT_FIELDS: Record<string, { key: "phone" | "email"; message: string }> = {
  contact: {
    key: "phone",
    message: "Razorpay didn't accept that mobile number. Check it and try again.",
  },
  email: { key: "email", message: "Razorpay didn't accept that email. Check it and try again." },
};

/**
 * Razorpay ignores the number 0 (the SDK's type) for `fail_existing` and answers "Customer
 * already exists for the merchant"; only the string "0" makes it hand back the existing customer.
 */
const RETURN_EXISTING = "0" as unknown as 0;

/**
 * The Razorpay customer with the parent's email and phone, found or created: a card token order
 * is refused until its customer has both. Matching is by email and phone, so local, preview and
 * production (one shared test account) get the same customer for the same parent. Neither value
 * is kept or logged: a 400 naming one of them becomes VALIDATION on that field (logged by code,
 * reason and field name only, since the description can echo the value); anything else, the
 * unexpected "already exists" included, is UNAVAILABLE.
 */
async function customerWithContact(
  client: Razorpay,
  contact: { email: string; phone: string },
): Promise<string> {
  let customer: { id?: string };
  try {
    customer = await withDeadline(() =>
      client.customers.create({
        name: "Jarso parent",
        email: contact.email,
        contact: contact.phone,
        fail_existing: RETURN_EXISTING,
      }),
    );
  } catch (cause) {
    const field =
      isRazorpaySdkError(cause) && Number(cause.statusCode) === 400
        ? CONTACT_FIELDS[cause.error?.field ?? ""]
        : undefined;
    if (!field || !isRazorpaySdkError(cause)) throw toAppError("customers.create", cause);
    logger.warn("razorpay refused the customer's contact details", {
      op: "customers.create",
      code: cause.error?.code,
      reason: cause.error?.reason,
      field: cause.error?.field,
    });
    throw new AppError("VALIDATION", field.message, {
      fieldErrors: { [field.key]: [field.message] },
      cause: { status: 400, code: cause.error?.code, field: cause.error?.field },
    });
  }
  if (!customer?.id) throw unavailable(new Error("Razorpay customer has no id"));
  return customer.id;
}

const is4xx = (cause: unknown): cause is RazorpaySdkError =>
  isRazorpaySdkError(cause) && Number(cause.statusCode) >= 400 && Number(cause.statusCode) < 500;

type MethodRef = { customerId: string; tokenId: string; authPaymentId: string };

/**
 * A saved card is `<customer_id>:<token_id>:<auth payment id>`. Anything else is refused: the
 * caller treats it as UNAVAILABLE and logs only Jarso's own ids, never the ref.
 */
function parseMethodRef(methodRef: string): MethodRef | null {
  const parts = methodRef.split(":");
  if (parts.length !== 3 || parts.some((part) => part === "")) return null;
  const [customerId, tokenId, authPaymentId] = parts as [string, string, string];
  return { customerId, tokenId, authPaymentId };
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
    // A card token order fails ("contact/email field is required for recurring") until the
    // customer has both (spec D6).
    setupNeedsContact: true,

    minimumChargeMinor: razorpayMinimumChargeMinor,

    async ensureCustomer({ parentId, email }) {
      // fail_existing "0" hands back the existing customer instead of erroring.
      const customer = await call("customers.create", () =>
        client.customers.create({
          name: "Jarso parent",
          ...(email ? { email } : {}),
          fail_existing: RETURN_EXISTING,
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

    /**
     * An order with a card token, paid in Razorpay Checkout on Jarso's save-card page (spec D6).
     * The ₹1 authorisation is captured in test mode and not refunded. The order is for the
     * customer with the parent's email and phone (found or created), not `customerRef`, which
     * may have neither: Razorpay refuses the order without them. The saved card's methodRef
     * carries that customer's id (from the webhook's payment), so charges use it.
     */
    async createHostedSetup(i) {
      if (!i.contact) {
        throw new AppError("VALIDATION", "Enter your mobile number to save a card.", {
          fieldErrors: { phone: ["Enter your mobile number to save a card."] },
        });
      }
      const customerId = await customerWithContact(client, i.contact);
      // The SDK types `expire_at` as required; the API defaults it, so Jarso sends none.
      const token = { max_amount: TOKEN_MAX_AMOUNT_MINOR, frequency: "as_presented" };
      const order = await call("orders.create", () =>
        client.orders.create({
          amount: SETUP_AMOUNT_MINOR,
          currency: "INR",
          customer_id: customerId,
          method: "card",
          payment_capture: true,
          receipt: i.setupId,
          notes: { jarsoSetup: i.setupId },
          token: token as Tokens.RazorpayTokenCard,
        }),
      );
      if (!order?.id) throw unavailable(new Error("Razorpay order has no id"));
      const url = new URL(opts.checkoutUrl);
      url.searchParams.set("order", order.id);
      url.searchParams.set("customer", customerId);
      url.searchParams.set("success", i.successUrl);
      url.searchParams.set("cancel", i.cancelUrl);
      return { redirectUrl: url.toString(), providerRef: order.id };
    },

    /**
     * A repeat debit on the saved card. Razorpay needs the cardholder's email and contact, which
     * Jarso never stores: they are read back from the save-card payment. The outcome arrives by
     * webhook (the bank may hold it for about 36 h).
     */
    async chargeSaved(i) {
      const ref = parseMethodRef(i.methodRef);
      if (!ref) {
        logger.error("razorpay saved card reference is malformed", { paymentId: i.paymentId });
        throw unavailable();
      }
      // The card is charged on its own customer (the one with the parent's email and phone that
      // saved it), which is usually not `customerRef`: createHostedSetup finds or creates it.

      const auth = await call("payments.fetch", () => client.payments.fetch(ref.authPaymentId));
      const email = auth?.email;
      const contact = auth?.contact;
      if (!email || !contact) {
        logger.error("razorpay saved card has no email or contact", {
          paymentId: i.paymentId,
          authPaymentId: ref.authPaymentId,
        });
        throw unavailable();
      }

      const currency = i.currency.toUpperCase();
      const notes = { jarsoCharge: i.paymentId };
      const order = await call("orders.create", () =>
        client.orders.create({
          amount: i.amountMinor,
          currency,
          payment_capture: true,
          receipt: i.paymentId,
          notes,
        }),
      );
      if (!order?.id) throw unavailable(new Error("Razorpay order has no id"));

      try {
        await withDeadline(() =>
          client.payments.createRecurringPayment({
            email,
            contact,
            amount: i.amountMinor,
            currency,
            order_id: order.id,
            customer_id: ref.customerId,
            token: ref.tokenId,
            recurring: true,
            description: i.description,
            notes,
          }),
        );
      } catch (cause) {
        if (!is4xx(cause)) throw toAppError("payments.createRecurringPayment", cause);
        // Razorpay refused this card for this charge: a failed charge, not an outage.
        logger.warn("razorpay recurring payment refused", {
          paymentId: i.paymentId,
          orderId: order.id,
          status: Number(cause.statusCode),
          code: cause.error?.code,
          reason: cause.error?.reason,
          ...errorDetail(cause.error),
        });
        return {
          providerRef: order.id,
          status: "failed",
          failureCode: mapRazorpayFailureCode(cause.error?.reason),
        };
      }
      return { providerRef: order.id, status: "pending" };
    },

    /** Deletes the card token. One already gone counts as removed. */
    async detachMethod(methodRef) {
      const ref = parseMethodRef(methodRef);
      if (!ref) {
        logger.error("razorpay saved card reference is malformed", { op: "detachMethod" });
        throw unavailable();
      }
      try {
        await withDeadline(() => client.customers.deleteToken(ref.customerId, ref.tokenId));
      } catch (cause) {
        const gone =
          isRazorpaySdkError(cause) &&
          Number(cause.statusCode) === 400 &&
          /does not exist/i.test(cause.error?.description ?? "");
        if (gone) return;
        throw toAppError("customers.deleteToken", cause);
      }
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
      const missingCard = setupCardToFetch(event);
      if (missingCard) {
        // A saved card needs its brand and last 4. Failing here answers 5xx, so Razorpay retries.
        const payment = await call("payments.fetch", () =>
          client.payments.fetch(missingCard, { "expand[]": "card" }),
        );
        const entity = event.payload.payment?.entity;
        if (entity) entity.card = (payment as { card?: typeof entity.card }).card ?? null;
      }
      const failedOrder = failedPaymentOrderToFetch(event);
      if (failedOrder) {
        // The order's notes (server-set) name the Jarso payment, never the payment's own notes.
        // Failing here answers 5xx, so Razorpay retries.
        const order = await call("orders.fetch", () => client.orders.fetch(failedOrder));
        return mapRazorpayEvent(event, eventId, { order: order as RazorpayOrder });
      }
      return mapRazorpayEvent(event, eventId);
    },
  };
}
