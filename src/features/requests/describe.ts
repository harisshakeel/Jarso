import { formatMoney } from "@/lib";
import type { CapPeriod, RequestKind, RequestStatus } from "./types";

export type StatusLabel = "Waiting" | "Approved" | "Done" | "Not approved" | "Cancelled";

/** The chip a request shows. A confirmed deposit and a handed-over withdrawal are both "Done". */
export function statusLabel(_kind: RequestKind, status: RequestStatus): StatusLabel {
  switch (status) {
    case "pending":
      return "Waiting";
    case "approved":
      return "Approved";
    case "handed_over":
    case "confirmed":
      return "Done";
    case "rejected":
      return "Not approved";
    case "cancelled":
      return "Cancelled";
  }
}

const PER: Record<CapPeriod, string> = { item: "each time", week: "a week", month: "a month" };

/** Why a withdrawal went over a cap, in the child's words. */
export function overCapMessage(
  period: CapPeriod,
  capMinor: number,
  usedMinor: number,
  currency: string,
): string {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const first = `You can take out up to ${money(capMinor)} ${PER[period]}.`;
  // A per-time cap has no running total, so there is nothing "already taken out".
  if (usedMinor <= 0) return first;
  return `${first} ${money(usedMinor)} is already taken out or waiting.`;
}
