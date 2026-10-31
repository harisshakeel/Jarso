import type { CardSummary, FailureCode } from "@/lib/payments";

export type { CardSummary, FailureCode };

/** What a card payment pays for: a due allowance occurrence or a gift. */
export type PaymentSource = { type: "occurrence" | "parent_gift"; id: string };

/** Where an auto-charge toggle lives: the child's allowance schedule or one gift. */
export type AutoChargeTarget = { type: "allowance_schedule" | "parent_gift"; id: string };

/** The handover screen's view of card payments for one item. Parents only. */
export type CardPaymentState = {
  available: boolean;
  /** off: payments are turned off. Null when available. */
  unavailableReason: "off" | "too_small" | "unsupported_currency" | null;
  /** A live, unexpired attempt; its hosted page when it has one (an auto charge has none). */
  pending: { redirectUrl: string | null } | null;
  /** The latest attempt, when it ended in a way the parent should hear about. */
  lastOutcome: {
    status: "succeeded_unapplied" | "failed";
    failureCode: FailureCode | null;
  } | null;
};
