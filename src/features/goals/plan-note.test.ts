import { describe, expect, it } from "vitest";
import { planNote } from "./plan-note";

const goal = { name: "Football boots", emoji: "⚽", planMinor: 400 };

describe("planNote", () => {
  it("tells the parent the child's plan toward their goal", () => {
    expect(planNote("Maya", goal, "GBP")).toBe(
      "Maya plans to save £4 each time toward ⚽ Football boots",
    );
  });

  it("says nothing without a goal or a plan", () => {
    expect(planNote("Maya", null, "GBP")).toBeNull();
    expect(planNote("Maya", { ...goal, planMinor: null }, "GBP")).toBeNull();
    expect(planNote("Maya", { ...goal, planMinor: 0 }, "GBP")).toBeNull();
  });
});
