import { describe, expect, it } from "vitest";
import { explainOutcome, predictOutcome } from "./predict";

const base = { saveMinor: 6400, reservedMinor: 0, targetMinor: 12000, planMinor: 800 };
const money = (minor: number) => `£${minor / 100}`;

describe("predictOutcome", () => {
  it("a take-out pushes the goal further off", () => {
    const o = predictOutcome({ ...base, move: "take_out", amountMinor: 1600 });
    expect(o).toMatchObject({ actual: "further", before: 7, after: 9 });
  });

  it("a put-in brings it closer", () => {
    const o = predictOutcome({ ...base, move: "put_in", amountMinor: 1600 });
    expect(o).toMatchObject({ actual: "closer", before: 7, after: 5 });
  });

  it("a small move that doesn't change the allowance count is the same", () => {
    const o = predictOutcome({ ...base, move: "put_in", amountMinor: 100 });
    expect(o.actual).toBe("closer");
    expect(o.before).toBe(7);
    expect(o.after).toBe(7);
    // Same count, but the remaining dropped: still closer in money, so "closer".
    expect(o.remainingAfter).toBe(5500);
  });

  it("a plan change changes only the estimate", () => {
    const up = predictOutcome({ ...base, move: "change_plan", amountMinor: 1600 });
    expect(up).toMatchObject({ actual: "closer", before: 7, after: 4, remainingAfter: 5600 });
    const down = predictOutcome({ ...base, move: "change_plan", amountMinor: 400 });
    expect(down).toMatchObject({ actual: "further", after: 14 });
  });

  it("falls back to money when there is no plan", () => {
    const o = predictOutcome({ ...base, planMinor: null, move: "take_out", amountMinor: 1000 });
    expect(o).toMatchObject({ actual: "further", before: null, after: null, remainingAfter: 6600 });
  });

  it("reaching the goal reads as enough", () => {
    const o = predictOutcome({ ...base, move: "put_in", amountMinor: 5600 });
    expect(o.after).toBe(0);
    expect(explainOutcome(o, "bike", money)).toBe("You'd have enough for your bike.");
  });
});

describe("explainOutcome", () => {
  it("names the allowances before and after, without judging", () => {
    const o = predictOutcome({ ...base, move: "take_out", amountMinor: 1600 });
    const text = explainOutcome(o, "bike", money);
    expect(text).toBe(
      "Your bike would be about 9 allowances away instead of 7 allowances: further off.",
    );
    expect(text).not.toMatch(/should|waste|bad|good/);
  });

  it("falls back to money without a plan", () => {
    const o = predictOutcome({ ...base, planMinor: null, move: "put_in", amountMinor: 1000 });
    expect(explainOutcome(o, "bike", money)).toBe(
      "You'd need £46 for your bike, less than now (£56).",
    );
  });
});
