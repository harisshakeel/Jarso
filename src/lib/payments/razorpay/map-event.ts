import type { FailureCode, PaymentStatus, ProviderEvent } from "../types";

/** Razorpay sends `notes` as `[]` when empty, else a string map. */
type Notes = Record<string, string> | unknown[];

type PaymentLinkEntity = {
  id: string;
  reference_id?: string | null;
  status?: string;
  order_id?: string | null;
  notes?: Notes;
  public_key?: string;
};

type OrderEntity = { id: string; public_key?: string; notes?: Notes };

type PaymentEntity = {
  id?: string;
  order_id?: string | null;
  customer_id?: string | null;
  token_id?: string | null;
  card?: { network?: string | null; last4?: string | null } | null;
  notes?: Notes;
  error_reason?: string | null;
  [key: string]: unknown;
};

/** The webhook envelope, trimmed to what Jarso reads. */
export type RazorpayEvent = {
  entity: "event";
  account_id?: string;
  event: string;
  contains?: string[];
  payload: {
    payment_link?: { entity: PaymentLinkEntity };
    order?: { entity: OrderEntity };
    payment?: { entity: PaymentEntity };
  };
  created_at?: number;
};

const FAILURE_CODES: Record<string, FailureCode> = {
  card_declined: "declined",
  payment_declined: "declined",
  debit_declined: "declined",
  payment_risk_check_failed: "declined",
  debit_instrument_blocked: "declined",
  insufficient_funds: "insufficient_funds",
  insufficient_fund: "insufficient_funds",
  authentication_failed: "authentication_required",
  incorrect_otp: "authentication_required",
  otp_expired: "authentication_required",
  otp_attempts_exceeded: "authentication_required",
  card_expired: "expired_card",
  incorrect_card_expiry_date: "expired_card",
};

/** Razorpay's `error_reason` to ours. */
export function mapRazorpayFailureCode(reason?: string | null): FailureCode {
  return (reason && Object.hasOwn(FAILURE_CODES, reason) && FAILURE_CODES[reason]) || "other";
}

/** Test mode only (spec D5): an event whose order or link was made with a live key is refused. */
export function isLiveModeEvent(event: RazorpayEvent): boolean {
  const keys = [
    event.payload?.order?.entity?.public_key,
    event.payload?.payment_link?.entity?.public_key,
  ];
  return keys.some((key) => typeof key === "string" && key.startsWith("rzp_live_"));
}

const LINK_STATUS: Record<string, PaymentStatus> = {
  "payment_link.paid": "succeeded",
  "payment_link.expired": "expired",
  "payment_link.cancelled": "canceled",
};

/** A note Jarso set, or undefined (`notes` may be `[]`). */
function note(notes: Notes | undefined, key: string): string | undefined {
  if (!notes || Array.isArray(notes)) return undefined;
  const value = Object.hasOwn(notes, key) ? notes[key] : undefined;
  return typeof value === "string" && value !== "" ? value : undefined;
}

const nonEmpty = (value: unknown): value is string => typeof value === "string" && value !== "";

/** The setup id when this is `order.paid` for a save-card order, else undefined. */
function setupIdOf(event: RazorpayEvent): string | undefined {
  if (event.event !== "order.paid") return undefined;
  return note(event.payload?.order?.entity?.notes, "jarsoSetup");
}

/**
 * The payment to fetch (with its card expanded) before mapping: a save-card `order.paid` whose
 * payment came without its `card` object. Null when nothing needs fetching.
 */
export function setupCardToFetch(event: RazorpayEvent): string | null {
  if (!setupIdOf(event)) return null;
  const payment = event.payload?.payment?.entity;
  if (!payment || !nonEmpty(payment.id) || payment.card) return null;
  return payment.id;
}

/** A saved card from the save-card order's payment: `customer_id:token_id:payment id`. */
function mapSetup(event: RazorpayEvent, eventId: string, setupId: string): ProviderEvent {
  const payment = event.payload?.payment?.entity;
  const network = payment?.card?.network;
  const last4 = payment?.card?.last4;
  if (
    !payment ||
    !nonEmpty(payment.id) ||
    !nonEmpty(payment.customer_id) ||
    !nonEmpty(payment.token_id) ||
    !nonEmpty(network) ||
    !nonEmpty(last4)
  ) {
    return { kind: "setup_failed", eventId, setupId, reason: "failed" };
  }
  return {
    kind: "setup",
    eventId,
    setupId,
    methodRef: `${payment.customer_id}:${payment.token_id}:${payment.id}`,
    card: { brand: network.toLowerCase(), last4 },
  };
}

/**
 * Maps a verified Razorpay event to ours, or null for events Jarso does not act on. A Payment
 * Link is matched by the paymentId sent as its `reference_id`; a save-card order by its
 * `jarsoSetup` note; an auto charge by its `jarsoCharge` note (on the order and the payment).
 * Failed attempts without a `jarsoCharge` note (pay now, save card) are ignored: the parent can
 * try again on the same page.
 */
export function mapRazorpayEvent(event: RazorpayEvent, eventId: string): ProviderEvent | null {
  const linkStatus = Object.hasOwn(LINK_STATUS, event.event) ? LINK_STATUS[event.event] : undefined;
  if (linkStatus) {
    const link = event.payload?.payment_link?.entity;
    if (!link?.id || !link.reference_id) return null;
    return {
      kind: "payment",
      eventId,
      paymentId: link.reference_id,
      providerRef: link.id,
      status: linkStatus,
    };
  }

  if (event.event === "order.paid") {
    const setupId = setupIdOf(event);
    if (setupId) return mapSetup(event, eventId, setupId);
    const order = event.payload?.order?.entity;
    const paymentId = note(order?.notes, "jarsoCharge");
    if (!order || !nonEmpty(order.id) || !paymentId) return null;
    return { kind: "payment", eventId, paymentId, providerRef: order.id, status: "succeeded" };
  }

  if (event.event === "payment.captured" || event.event === "payment.failed") {
    const payment = event.payload?.payment?.entity;
    const paymentId = note(payment?.notes, "jarsoCharge");
    if (!payment || !paymentId || !nonEmpty(payment.order_id)) return null;
    if (event.event === "payment.captured") {
      return {
        kind: "payment",
        eventId,
        paymentId,
        providerRef: payment.order_id,
        status: "succeeded",
      };
    }
    return {
      kind: "payment",
      eventId,
      paymentId,
      providerRef: payment.order_id,
      status: "failed",
      failureCode: mapRazorpayFailureCode(payment.error_reason),
    };
  }

  return null;
}
