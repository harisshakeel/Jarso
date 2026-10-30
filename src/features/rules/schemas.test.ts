import { describe, expect, it } from "vitest";
import { overspendSchema, setRuleSchema } from "./schemas";

const childId = "6f1c2a52-3c4e-4c8e-9a51-0a1b2c3d4e5f";
const base = { childId, kind: "spend_limit", period: "week" };
const schema = setRuleSchema("GBP");

describe("setRuleSchema", () => {
  it("parses an amount into minor units", () => {
    expect(schema.parse({ ...base, amount: "10.50" })).toEqual({
      childId,
      kind: "spend_limit",
      period: "week",
      amountMinor: 1050,
    });
  });

  it("treats an empty amount as off", () => {
    expect(schema.parse({ ...base, amount: "" }).amountMinor).toBeNull();
  });

  it("rejects too many decimals, zero and unknown kinds", () => {
    expect(schema.safeParse({ ...base, amount: "5.555" }).success).toBe(false);
    expect(schema.safeParse({ ...base, amount: "0" }).success).toBe(false);
    expect(schema.safeParse({ ...base, kind: "nope", amount: "5" }).success).toBe(false);
    expect(schema.safeParse({ ...base, period: "year", amount: "5" }).success).toBe(false);
  });
});

describe("overspendSchema", () => {
  it("needs a child and a boolean", () => {
    expect(overspendSchema.parse({ childId, allowed: true })).toEqual({ childId, allowed: true });
    expect(overspendSchema.safeParse({ childId: "x", allowed: true }).success).toBe(false);
  });
});
