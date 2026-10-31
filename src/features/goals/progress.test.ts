import { describe, expect, it } from "vitest";
import { goalProgress } from "./progress";

describe("goalProgress", () => {
  it("counts Save less reserved and estimates payments from the plan", () => {
    const p = goalProgress({
      saveMinor: 3100,
      reservedMinor: 500,
      targetMinor: 4500,
      planMinor: 400,
    });
    expect(p.countedMinor).toBe(2600);
    expect(p.remainingMinor).toBe(1900);
    expect(p.paymentsLeft).toBe(5);
    expect(p.reached).toBe(false);
    expect(p.fillRatio).toBeCloseTo(0.578, 3);
  });

  it("gives no estimate without a positive plan", () => {
    const base = { saveMinor: 3100, reservedMinor: 500, targetMinor: 4500 };
    expect(goalProgress({ ...base, planMinor: 0 }).paymentsLeft).toBeNull();
    expect(goalProgress({ ...base, planMinor: null }).paymentsLeft).toBeNull();
  });

  it("is reached and full once counted covers the target", () => {
    const p = goalProgress({
      saveMinor: 5000,
      reservedMinor: 0,
      targetMinor: 4500,
      planMinor: 400,
    });
    expect(p.remainingMinor).toBe(0);
    expect(p.paymentsLeft).toBe(0);
    expect(p.reached).toBe(true);
    expect(p.fillRatio).toBe(1);
  });

  it("is reached with no estimate when there is no plan", () => {
    const p = goalProgress({
      saveMinor: 5000,
      reservedMinor: 0,
      targetMinor: 4500,
      planMinor: null,
    });
    expect(p.remainingMinor).toBe(0);
    expect(p.paymentsLeft).toBeNull();
    expect(p.reached).toBe(true);
  });

  it("never counts below zero when more is reserved than saved", () => {
    const p = goalProgress({
      saveMinor: 300,
      reservedMinor: 500,
      targetMinor: 4500,
      planMinor: 400,
    });
    expect(p.countedMinor).toBe(0);
    expect(p.remainingMinor).toBe(4500);
    expect(p.fillRatio).toBe(0);
  });
});
