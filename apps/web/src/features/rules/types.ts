export const ruleKinds = [
  "spend_limit",
  "withdrawal_cap",
  "withdrawal_auto_approve",
  "deposit_auto_confirm",
] as const;
export type RuleKind = (typeof ruleKinds)[number];

export const periods = ["item", "week", "month"] as const;
export type Period = (typeof periods)[number];

/** One parent-set rule for a child. `amountMinor` is minor units of the family currency. */
export type MoneyRule = { kind: RuleKind; period: Period; amountMinor: number };

export type ChildRules = { allowNegativeSpend: boolean; rules: MoneyRule[] };
