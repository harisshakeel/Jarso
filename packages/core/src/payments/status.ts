import type { PaymentStatus } from "@jarso/core/lib";

/** A payment's status as stored: the provider's, plus money captured but not posted. */
export type StoredStatus = PaymentStatus | "succeeded_unapplied";

const storedStatuses: readonly StoredStatus[] = [
  "pending",
  "requires_action",
  "succeeded",
  "succeeded_unapplied",
  "failed",
  "canceled",
  "expired",
];

export function isStoredStatus(value: string): value is StoredStatus {
  return (storedStatuses as readonly string[]).includes(value);
}

/** Whether a payment has ended: nothing but a late success can move it any more. */
export function isFinalStatus(status: StoredStatus): boolean {
  return status !== "pending" && status !== "requires_action";
}

/**
 * The status a provider event moves a payment to, or null to leave it alone. The machine only
 * moves forward, so a late or replayed event is a no-op:
 * - succeeded from any non-succeeded state (the provider captured the money, even after expiry);
 * - nothing leaves succeeded / succeeded_unapplied;
 * - failed / expired / canceled only from pending / requires_action;
 * - requires_action only from pending; nothing moves back to pending.
 */
export function nextStatus(current: StoredStatus, incoming: PaymentStatus): PaymentStatus | null {
  if (current === incoming) return null;
  if (current === "succeeded" || current === "succeeded_unapplied") return null;
  const live = current === "pending" || current === "requires_action";
  switch (incoming) {
    case "succeeded":
      return "succeeded";
    case "failed":
    case "expired":
    case "canceled":
      return live ? incoming : null;
    case "requires_action":
      return current === "pending" ? "requires_action" : null;
    case "pending":
      return null;
  }
}
