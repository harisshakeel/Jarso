import { allowancePlan, allowancePlanLine, planStep } from "@jarso/core/guide";
import { describe, expect, it } from "vitest";

const base = {
  cashMinor: 1000,
  savedMinor: 0,
  availableSpendMinor: 1000,
  currency: "GBP",
  goal: null,
};

describe("planStep", () => {
  it("is half a unit, or ten with no minor units", () => {
    expect(planStep("GBP")).toBe(50);
    expect(planStep("INR")).toBe(50);
    expect(planStep("JPY")).toBe(10);
  });
});

describe("allowancePlan", () => {
  it("proposes 30% to Save without a goal, rounded down to a step", () => {
    expect(allowancePlan({ ...base, cashMinor: 1230, availableSpendMinor: 1230 })).toEqual({
      saveMinor: 350, // 30% of 12.30 is 3.69, rounded down to 3.50
      spendMinor: 880,
      reason: "habit",
    });
  });

  it("counts what the parent already put into Save", () => {
    // 10.00 in all, 2.00 already in Save: the habit share is 3.00, so 1.00 more.
    expect(
      allowancePlan({ ...base, cashMinor: 800, savedMinor: 200, availableSpendMinor: 800 }),
    ).toEqual({ saveMinor: 100, spendMinor: 700, reason: "habit" });
    // Already past the habit share: nothing to propose.
    expect(allowancePlan({ ...base, cashMinor: 600, savedMinor: 400 })).toBeNull();
  });

  it("follows the goal plan, capped at 60% of the allowance", () => {
    const goal = { name: "bike", planMinor: 400, remainingMinor: 5000 };
    expect(allowancePlan({ ...base, goal })).toEqual({
      saveMinor: 400,
      spendMinor: 600,
      reason: "goal",
    });
    const greedy = { ...goal, planMinor: 900 };
    expect(allowancePlan({ ...base, goal: greedy })).toEqual({
      saveMinor: 600,
      spendMinor: 400,
      reason: "goal",
    });
  });

  it("never proposes past the goal, past Spend, or past the cash part", () => {
    const nearlyThere = { name: "bike", planMinor: 400, remainingMinor: 120 };
    expect(allowancePlan({ ...base, goal: nearlyThere })?.saveMinor).toBe(100);
    expect(allowancePlan({ ...base, availableSpendMinor: 120 })?.saveMinor).toBe(100);
    expect(
      allowancePlan({ ...base, cashMinor: 120, savedMinor: 880, availableSpendMinor: 5000 }),
    ).toBeNull(); // 60% cap already met by the parent's split
  });

  it("uses the habit share for a goal without a plan, and ignores a reached goal", () => {
    const noPlan = { name: "bike", planMinor: null, remainingMinor: 5000 };
    expect(allowancePlan({ ...base, goal: noPlan })).toEqual({
      saveMinor: 300,
      spendMinor: 700,
      reason: "goal",
    });
    const reached = { name: "bike", planMinor: 400, remainingMinor: 0 };
    expect(allowancePlan({ ...base, goal: reached })?.reason).toBe("habit");
  });

  it("proposes nothing when the amount comes to less than a step, or no cash landed", () => {
    expect(allowancePlan({ ...base, cashMinor: 100, availableSpendMinor: 100 })).toBeNull();
    expect(allowancePlan({ ...base, cashMinor: 0, savedMinor: 500 })).toBeNull();
    expect(allowancePlan({ ...base, availableSpendMinor: 0 })).toBeNull();
  });
});

describe("allowancePlanLine", () => {
  const money = (minor: number) => `£${(minor / 100).toFixed(2)}`;

  it("names the goal when the plan is for it", () => {
    expect(
      allowancePlanLine({ saveMinor: 400, spendMinor: 600, reason: "goal" }, money, "bike"),
    ).toBe("Pop £4.00 into Save and your bike keeps moving. £6.00 stays in Spend.");
  });

  it("keeps it simple without a goal, and drops the Spend part when nothing stays", () => {
    expect(
      allowancePlanLine({ saveMinor: 300, spendMinor: 700, reason: "habit" }, money, null),
    ).toBe("Tuck £3.00 into Save for later. £7.00 stays in Spend.");
    expect(allowancePlanLine({ saveMinor: 300, spendMinor: 0, reason: "habit" }, money, null)).toBe(
      "Tuck £3.00 into Save for later.",
    );
  });
});
