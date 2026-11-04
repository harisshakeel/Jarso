import type { SavingsRequest } from "./types";

// What a parent reads about a child's requests. Moved word for word from the web components so
// the phone says the same. `amount` is already formatted by the caller.

export const parentRequestCopy = {
  title: "Requests",
  overAvailable: "There isn't enough in Save for this now.",
  approved: (amount: string, nickname: string) => `Approved. Hand ${amount} to ${nickname}.`,
  rejected: "Not now. We let them know.",
  settled: "Already sorted.",
  cancelled: "Okay, left as it was.",
  depositRejected: "Okay, not added.",
  depositDone: "Added to Save.",
  handedOver: "Handed over.",
  confirm: "Confirm",
  didntGetIt: "Didn't get it",
  approve: "Approve",
  notNow: "Not now",
  didntHandOver: "Didn't hand it over",
  didntHandOverTitle: "Didn't hand it over?",
  didntHandOverBody: "The money stays in Save and this request closes.",
  goBack: "Go back",
  didntHandOverConfirm: "Yes, didn't hand it over",
} as const;

/**
 * The line a parent reads for one request: a put-in to confirm, an approved take-out (extra or
 * not) to hand over, or a take-out or an ask for extra to decide on.
 */
export function requestSentence(
  request: Pick<SavingsRequest, "kind" | "status" | "reason">,
  nickname: string,
  amount: string,
): string {
  if (request.kind === "deposit") return `${nickname} gave you ${amount}?`;
  if (request.status === "approved") {
    return request.kind === "emergency"
      ? `Hand over ${amount} extra to ${nickname}`
      : `Hand over ${amount} to ${nickname}`;
  }
  // The reason is required for an emergency; it is what the parent decides on.
  if (request.kind === "emergency") {
    return `${nickname} asks for ${amount} extra: ${request.reason ?? ""}`;
  }
  return `${nickname} wants ${amount}${request.reason ? `: ${request.reason}` : ""}`;
}
