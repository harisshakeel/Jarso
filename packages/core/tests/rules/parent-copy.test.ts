import { type ChildRules, rulesCopy, spendingSummary } from "@jarso/core/rules";
import { describe, expect, it } from "vitest";

describe("rulesCopy", () => {
  it("keeps every line", () => {
    expect(rulesCopy).toMatchSnapshot();
  });

  it("fills in the child's nickname as the web did", () => {
    expect(rulesCopy.depositNote("Ada")).toBe(
      "Money Ada puts in under a rule counts in Save straight away, before you have the cash.",
    );
    expect(rulesCopy.overspend("Ada")).toBe("Let Ada's Spend go below zero");
  });
});

describe("spendingSummary", () => {
  const rules = (kinds: string[]) =>
    ({ rules: kinds.map((kind) => ({ kind })) }) as unknown as ChildRules;

  it("says a limit sends a note when one is set", () => {
    expect(spendingSummary(rules(["spend_limit"]), "Ada")).toBe(
      "You'll get a note when Ada goes over these. Ada can still record it.",
    );
  });

  it("says there are none otherwise", () => {
    expect(spendingSummary(rules(["withdrawal_cap"]), "Ada")).toBe("No spending limits yet");
  });
});
