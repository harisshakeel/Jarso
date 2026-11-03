import type { ChildRules } from "./types";

// The parent's money rules page. Moved word for word from the web components so the phone says
// the same.

export const rulesCopy = {
  title: "Money rules",
  intro: (nickname: string) =>
    `Set how ${nickname} spends. Limits send you a note. They never stop a purchase.`,
  spending: "Spending",
  addSpendLimit: "Add a spending limit",
  spendLimitEmpty: (nickname: string) =>
    `Add one to get a note when ${nickname} spends more than an amount.`,
  spendingNotes: (nickname: string) =>
    `You'll get a note when ${nickname} goes over these. ${nickname} can still record it.`,
  noSpendingLimits: "No spending limits yet",
  moves: "Moving money between jars",
  takeOut: "Taking money out of Save",
  takeOutNotify: "Take-outs are recorded at once and you get a note; the limits below still hold.",
  capTitle: (nickname: string) => `How much can ${nickname} take out?`,
  addCap: "Add a limit",
  capEmpty: "No limit: any amount can be asked for.",
  autoTitle: (nickname: string) => `What can ${nickname} take out without asking?`,
  addAuto: (nickname: string) => `Let ${nickname} take out without asking`,
  autoEmpty: "Nothing yet: every take-out waits for your yes.",
  putIn: "Putting money into Save",
  putInNotify: "Put-ins count in Save at once and you get a note.",
  addDeposit: "Let put-ins count before I confirm",
  depositEmpty: (nickname: string) =>
    `Every put-in waits until you say you have the cash from ${nickname}.`,
  depositNote: (nickname: string) =>
    `Money ${nickname} puts in under a rule counts in Save straight away, before you have the cash.`,
  /** Jar moves: ask first, or just tell. */
  jarMovesOptions: [
    { mode: "ask", label: "Ask me first" },
    { mode: "notify", label: "Just tell me" },
  ],
  jarMovesLegend: (nickname: string) => `When ${nickname} moves money between jars`,
  jarMovesNotify:
    "Take-outs and put-ins are recorded at once and you get a note each time. Asking for extra money still waits for you.",
  jarMovesAsk:
    "Take-outs wait for your yes and the hand-over; put-ins wait until you have the cash.",
  /** Whether Spend may go below zero. */
  overspend: (nickname: string) => `Let ${nickname}'s Spend go below zero`,
  overspendOn: (nickname: string) => `${nickname} can record a purchase even if Spend is short.`,
  overspendOff: (nickname: string) => `${nickname} can only spend what is in Spend.`,
} as const;

/** One line on what the spending limits do: they send a note, they never block. */
export function spendingSummary(rules: ChildRules, nickname: string): string {
  const active = rules.rules.some((rule) => rule.kind === "spend_limit");
  return active ? rulesCopy.spendingNotes(nickname) : rulesCopy.noSpendingLimits;
}
