/** Take money out of Save, put money in, or ask for extra money (FR15, lands in Spend). */
export type RequestKind = "withdrawal" | "deposit" | "emergency";

export const requestStatuses = [
  "pending",
  "approved",
  "handed_over",
  "confirmed",
  "rejected",
  "cancelled",
] as const;
export type RequestStatus = (typeof requestStatuses)[number];

export type CapPeriod = "item" | "week" | "month";

export type SavingsRequest = {
  id: string;
  kind: RequestKind;
  status: RequestStatus;
  amountMinor: number;
  reason: string | null;
  auto: boolean;
  occurredAt: string;
};

/**
 * What a child can move right now. `takeOutLimitMinor` is the smallest remaining withdrawal cap
 * (never above what Save has free), or null when there is no cap.
 */
export type Availability = {
  spendMinor: number;
  saveMinor: number;
  reservedSaveMinor: number;
  heldSpendMinor: number;
  availableSaveMinor: number;
  availableSpendMinor: number;
  takeOutLimitMinor: number | null;
};

export type WithdrawalResult =
  | { status: "pending" | "approved" | "already_sent"; requestId: string }
  | { status: "over_available"; availableMinor: number }
  | { status: "over_cap"; period: CapPeriod; capMinor: number; usedMinor: number };

/** An emergency ask is always pending until a parent decides; nothing is reserved or capped. */
export type EmergencyResult = { status: "pending" | "already_sent"; requestId: string };

export type DepositResult =
  | { status: "pending" | "confirmed" | "already_sent"; requestId: string }
  | { status: "over_available"; availableMinor: number };

export type DecideWithdrawalResult = "approved" | "rejected" | "already_decided" | "over_available";
export type DecideDepositResult = "rejected" | "already_decided";
export type CompleteResult = "completed" | "already_completed" | "not_approved" | "over_available";
export type CancelResult = "cancelled" | "already_closed";
