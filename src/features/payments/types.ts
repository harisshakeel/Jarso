import type { CardSummary, FailureCode, PaymentProviderId } from "@/lib/payments";

export type { CardSummary, FailureCode, PaymentProviderId };

/** What a card payment pays for: a due allowance occurrence or a gift. */
export type PaymentSource = { type: "occurrence" | "parent_gift"; id: string };

/** Where an auto-charge toggle lives: the child's allowance schedule or one gift. */
export type AutoChargeTarget = { type: "allowance_schedule" | "parent_gift"; id: string };

/** The handover screen's view of card payments for one item. Parents only. */
export type CardPaymentState = {
  /**
   * Every provider that is on, in display order; empty when payments are off. One that can't
   * charge the family's currency is listed with `unsupported_currency` (the UI hides it).
   */
  providers: {
    id: PaymentProviderId;
    label: string;
    available: boolean;
    /** Null when available. */
    unavailableReason: "too_small" | "unsupported_currency" | null;
  }[];
  /**
   * A live, unexpired attempt and its provider; its hosted page when it has one (an auto charge
   * has none).
   */
  pending: { provider: PaymentProviderId; redirectUrl: string | null } | null;
  /** The latest attempt, when it ended in a way the parent should hear about. */
  lastOutcome: {
    status: "succeeded_unapplied" | "failed";
    failureCode: FailureCode | null;
  } | null;
};

/** The parent's saved card at one provider that is on (null: none saved there). */
export type SavedCard = { provider: PaymentProviderId; label: string; card: CardSummary | null };

/** What an auto-charge toggle needs to know about one provider that is on. */
export type AutoChargeCard = {
  provider: PaymentProviderId;
  label: string;
  /** Whether the parent has a saved card there. Without one, turning on saves a card first. */
  cardSaved: boolean;
  /** Set when this provider can't charge the family's currency at all. */
  unavailableReason: "unsupported_currency" | null;
};
