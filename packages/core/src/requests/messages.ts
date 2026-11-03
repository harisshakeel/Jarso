import { formatMoney } from "@jarso/core/lib";
import { overCapMessage } from "./describe";
import type { DepositResult, EmergencyResult, WithdrawalResult } from "./types";

/** What the child reads once the server has answered a deposit. */
export function depositMessage(result: DepositResult, currency: string): string {
  switch (result.status) {
    case "pending":
      return "Waiting for your parent to confirm";
    case "confirmed":
      return "Added to Save";
    case "done":
      return "Added to Save. Your parent knows.";
    case "already_sent":
      return "Already sent to your parent";
    case "over_available":
      return `Spend has ${formatMoney(result.availableMinor, currency, { showMinor: "nonzero" })}`;
  }
}

/** What the child reads once the server has answered a take-out ask. */
export function withdrawalMessage(result: WithdrawalResult, currency: string): string {
  switch (result.status) {
    case "pending":
      return "Sent to your parent";
    case "approved":
      return "Approved, your parent will hand it over";
    case "done":
      return "Done. Your parent knows.";
    case "already_sent":
      return "Already sent to your parent";
    case "over_cap":
      return overCapMessage(result.period, result.capMinor, result.usedMinor, currency);
    case "over_available":
      return `You can take out up to ${formatMoney(result.availableMinor, currency, { showMinor: "nonzero" })}`;
  }
}

/** What the child reads once the server has answered an ask for extra. Copy has no money, so the currency is unused. */
export function emergencyMessage(result: EmergencyResult, _currency: string): string {
  return result.status === "pending" ? "Sent to your parent" : "Already sent to your parent";
}

/** Shown when a child cancels a request the parent has already answered. */
export const requestAlreadyMovedOnMessage = "This one already moved on.";
