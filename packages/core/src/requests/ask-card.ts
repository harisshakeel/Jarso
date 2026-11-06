import type { SavingsRequest } from "./types";

// The phone's parent ask cards (mobile kid rework, plan 10): each request is a card answered in
// one tap. Phone-only words; the web keeps `parentRequestCopy`. `amount` is already formatted.

export const askCardCopy = {
  /** A put-in: the child hands cash to the parent. */
  gotIt: "Got it",
  notYet: "Not yet",
  /** A take-out or an ask for extra, waiting on a decision. */
  yes: "Yes",
  notNow: "Not now",
  /** An approved take-out, waiting to be handed over. */
  handedOver: "Handed over",
  didntGive: "Didn't give it",
  gotCash: "Got the cash?",
  fromSave: "From Save",
  extra: "Extra money",
  forReason: (reason: string) => `For: ${reason}`,
  approvedFromSave: "Approved · from Save",
  approvedExtra: "Approved · extra",
} as const;

/** Which pair of answers a card gets: money coming in, a decision, or money to hand over. */
export type AskCardKind = "receive" | "decide" | "handover";

export type AskCard = { kind: AskCardKind; title: string; line: string; yes: string; no: string };

/** The card for one request: which two answers it gets and its two lines. */
export function askCard(
  request: Pick<SavingsRequest, "kind" | "status" | "reason">,
  nickname: string,
  amount: string,
): AskCard {
  const c = askCardCopy;
  if (request.kind === "deposit") {
    return {
      kind: "receive",
      title: `${nickname} is saving ${amount}`,
      line: c.gotCash,
      yes: c.gotIt,
      no: c.notYet,
    };
  }
  const extra = request.kind === "emergency";
  if (request.status === "approved") {
    return {
      kind: "handover",
      title: `Hand ${amount} to ${nickname}`,
      line: extra ? c.approvedExtra : c.approvedFromSave,
      yes: c.handedOver,
      no: c.didntGive,
    };
  }
  return {
    kind: "decide",
    title: extra ? `${nickname} asks ${amount} extra` : `${nickname} asks ${amount} from Save`,
    line: request.reason ? c.forReason(request.reason) : extra ? c.extra : c.fromSave,
    yes: c.yes,
    no: c.notNow,
  };
}
