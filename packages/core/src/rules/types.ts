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

/** How the child moves money between their own jars: a request waits for the parent, or it is recorded at once and the parent is told. */
export const jarMovesModes = ["ask", "notify"] as const;
export type JarMovesMode = (typeof jarMovesModes)[number];

export type ChildRules = {
  allowNegativeSpend: boolean;
  jarMovesApproval: JarMovesMode;
  rules: MoneyRule[];
};
