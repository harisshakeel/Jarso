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

/** The webhook envelope, trimmed to what Jarso reads. */
export type RazorpayEvent = {
  entity: "event";
  account_id?: string;
  event: string;
  contains?: string[];
  payload: {
    payment_link?: { entity: PaymentLinkEntity };
    order?: { entity: OrderEntity };
    payment?: { entity: Record<string, unknown> };
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

/**
 * Maps a verified Razorpay event to ours, or null for events Jarso does not act on. A Payment
 * Link is matched by the paymentId sent as its `reference_id`.
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
  return null;
}
