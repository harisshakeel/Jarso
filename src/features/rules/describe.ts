import { formatMoney } from "@/lib";
import type { MoneyRule, Period } from "./types";

const PER: Record<Period, string> = { item: "per time", week: "a week", month: "a month" };

const money = (minor: number, currency: string) =>
  formatMoney(minor, currency, { showMinor: "nonzero" });

/** A rule as a sentence for the parent, e.g. "Tell me when Maya spends more than £10 a week". */
export function describeRule(rule: MoneyRule, nickname: string, currency: string): string {
  const amount = money(rule.amountMinor, currency);
  const per = PER[rule.period];
  switch (rule.kind) {
    case "spend_limit":
      return `Tell me when ${nickname} spends more than ${amount} ${per}`;
    case "withdrawal_cap":
      return `${nickname} can take out at most ${amount} ${per}`;
    case "withdrawal_auto_approve":
      return `${nickname} can take out up to ${amount} ${per} without asking me`;
    case "deposit_auto_confirm":
      return `Add deposits up to ${amount} ${per} without me confirming`;
  }
}

/** A rule as a sentence for the child. */
export function describeRuleForChild(rule: MoneyRule, currency: string): string {
  const amount = money(rule.amountMinor, currency);
  const per = PER[rule.period];
  switch (rule.kind) {
    case "spend_limit":
      return `Your parent gets a note when you spend more than ${amount} ${per}`;
    case "withdrawal_cap":
      return `You can take out at most ${amount} ${per}`;
    case "withdrawal_auto_approve":
      return `You can take out up to ${amount} ${per} without asking`;
    case "deposit_auto_confirm":
      return `Deposits up to ${amount} ${per} go straight into Save`;
  }
}

/** What a parent has to approve: everything, or only what is above the auto rule. */
export function summarise(
  rules: MoneyRule[],
  kind: "withdrawal" | "deposit",
  currency: string,
): string {
  const ruleKind = kind === "withdrawal" ? "withdrawal_auto_approve" : "deposit_auto_confirm";
  const mine = rules.filter((rule) => rule.kind === ruleKind);
  const [verb, plural] =
    kind === "withdrawal"
      ? (["come to you for approval", "Withdrawals"] as const)
      : (["wait for you to confirm", "Deposits"] as const);

  const item = mine.find((rule) => rule.period === "item");
  if (item) return `${plural} over ${money(item.amountMinor, currency)} ${verb}`;

  const smallest = mine
    .filter((rule) => rule.period !== "item")
    .sort((a, b) => a.amountMinor - b.amountMinor)[0];
  if (smallest) {
    return `${plural} beyond ${money(smallest.amountMinor, currency)} ${PER[smallest.period]} ${verb}`;
  }
  return kind === "withdrawal"
    ? "Every withdrawal comes to you for approval"
    : "Every deposit waits for you to confirm";
}
