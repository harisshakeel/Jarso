import { describe, expect, it } from "vitest";
import { goalInputSchema } from "./schemas";

const valid = { name: "Football boots", emoji: "⚽", target: "45", plan: "4" };

describe("goalInputSchema", () => {
  it("parses money to minor units in the family currency", () => {
    const parsed = goalInputSchema("GBP").parse(valid);
    expect(parsed).toEqual({
      name: "Football boots",
      emoji: "⚽",
      targetMinor: 4500,
      planMinor: 400,
    });
  });

  it("treats an empty plan as no plan", () => {
    expect(goalInputSchema("GBP").parse({ ...valid, plan: "" }).planMinor).toBeNull();
    expect(goalInputSchema("GBP").parse({ ...valid, plan: undefined }).planMinor).toBeNull();
  });

  it("refuses an emoji outside the set", () => {
    expect(goalInputSchema("GBP").safeParse({ ...valid, emoji: "🇬🇧" }).success).toBe(false);
  });

  it("refuses a name over 40 characters and a blank one", () => {
    expect(goalInputSchema("GBP").safeParse({ ...valid, name: "x".repeat(41) }).success).toBe(
      false,
    );
    expect(goalInputSchema("GBP").safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("refuses a price over the goal cap", () => {
    expect(goalInputSchema("GBP").safeParse({ ...valid, target: "10000.01" }).success).toBe(false);
  });
});
