import { describe, expect, it } from "vitest";
import { describeRule, describeRuleForChild, summarise } from "./describe";
import type { MoneyRule } from "./types";

const rule = (kind: MoneyRule["kind"], period: MoneyRule["period"], amountMinor: number) => ({
  kind,
  period,
  amountMinor,
});

describe("describeRule", () => {
  it("says each kind in the parent's voice", () => {
    expect(describeRule(rule("spend_limit", "item", 1000), "Maya", "GBP")).toBe(
      "Tell me when Maya spends more than £10 per time",
    );
    expect(describeRule(rule("withdrawal_cap", "month", 3000), "Maya", "GBP")).toBe(
      "Maya can take out at most £30 a month",
    );
    expect(describeRule(rule("withdrawal_auto_approve", "item", 500), "Maya", "GBP")).toBe(
      "Maya can take out up to £5 per time without asking me",
    );
    expect(describeRule(rule("deposit_auto_confirm", "week", 1000), "Maya", "GBP")).toBe(
      "Add deposits up to £10 a week without me confirming",
    );
  });

  it("shows minor units when not whole", () => {
    expect(describeRule(rule("spend_limit", "week", 1050), "Maya", "GBP")).toBe(
      "Tell me when Maya spends more than £10.50 a week",
    );
  });
});

describe("describeRuleForChild", () => {
  it("says each kind to the child", () => {
    expect(describeRuleForChild(rule("spend_limit", "week", 1000), "GBP")).toBe(
      "Your parent gets a note when you spend more than £10 a week",
    );
    expect(describeRuleForChild(rule("withdrawal_cap", "month", 3000), "GBP")).toBe(
      "You can take out at most £30 a month",
    );
    expect(describeRuleForChild(rule("withdrawal_auto_approve", "item", 500), "GBP")).toBe(
      "You can take out up to £5 per time without asking",
    );
    expect(describeRuleForChild(rule("deposit_auto_confirm", "week", 1000), "GBP")).toBe(
      "Deposits up to £10 a week go straight into Save",
    );
  });
});

describe("summarise", () => {
  it("says everything waits when there is no auto rule", () => {
    expect(summarise([], "deposit", "GBP")).toBe("Every deposit waits for you to confirm");
    expect(summarise([], "withdrawal", "GBP")).toBe("Every withdrawal comes to you for approval");
    expect(summarise([rule("spend_limit", "item", 100)], "withdrawal", "GBP")).toBe(
      "Every withdrawal comes to you for approval",
    );
  });

  it("uses the per-time rule", () => {
    expect(summarise([rule("deposit_auto_confirm", "item", 1000)], "deposit", "GBP")).toBe(
      "Deposits over £10 wait for you to confirm",
    );
    expect(summarise([rule("withdrawal_auto_approve", "item", 500)], "withdrawal", "GBP")).toBe(
      "Withdrawals over £5 come to you for approval",
    );
  });

  it("falls back to the smallest week or month rule", () => {
    const rules = [
      rule("withdrawal_auto_approve", "month", 5000),
      rule("withdrawal_auto_approve", "week", 2000),
    ];
    expect(summarise(rules, "withdrawal", "GBP")).toBe(
      "Withdrawals beyond £20 a week come to you for approval",
    );
    expect(summarise([rule("deposit_auto_confirm", "month", 3000)], "deposit", "GBP")).toBe(
      "Deposits beyond £30 a month wait for you to confirm",
    );
  });
});
