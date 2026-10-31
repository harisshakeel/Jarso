import { describe, expect, it } from "vitest";
import {
  autoChargeSchema,
  cardPaymentSchema,
  cardReturnParamsSchema,
  fakeCheckoutParamsSchema,
  fakeCheckoutSchema,
} from "./schemas";

const id = "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f";

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("cardPaymentSchema", () => {
  const valid = { kind: "allowance", id, cash: "3.00", saved: "2.00" };

  it("parses the split to minor units", () => {
    expect(cardPaymentSchema("GBP", 500).parse(valid)).toEqual({
      kind: "allowance",
      id,
      cashMinor: 300,
      savedMinor: 200,
    });
  });

  it("refuses a split that doesn't add up to the full amount", () => {
    const result = cardPaymentSchema("GBP", 500).safeParse({ ...valid, saved: "1.00" });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("Card pays the full amount");
  });

  it("allows all of it to one jar", () => {
    expect(cardPaymentSchema("GBP", 500).parse({ ...valid, cash: "0", saved: "5" })).toMatchObject({
      cashMinor: 0,
      savedMinor: 500,
    });
  });

  it("refuses nothing at all", () => {
    const result = cardPaymentSchema("GBP").safeParse({ ...valid, cash: "0", saved: "0" });
    expect(result.success).toBe(false);
  });

  it("leaves the full-amount check to the server when the amount isn't known", () => {
    expect(cardPaymentSchema("GBP").safeParse({ ...valid, saved: "1.00" }).success).toBe(true);
  });

  it("refuses an amount more precise than the currency", () => {
    expect(cardPaymentSchema("GBP", 500).safeParse({ ...valid, cash: "2.999" }).success).toBe(
      false,
    );
  });
});

describe("autoChargeSchema", () => {
  const valid = { type: "allowance_schedule", id, on: "true", returnTo: "/parent/children/x" };

  it("reads a form's on flag", () => {
    expect(autoChargeSchema.parse(valid)).toEqual({ ...valid, on: true });
    expect(autoChargeSchema.parse({ ...valid, on: "false" }).on).toBe(false);
    expect(autoChargeSchema.parse({ ...valid, on: true }).on).toBe(true);
  });

  it("accepts a path with a query", () => {
    expect(autoChargeSchema.safeParse({ ...valid, returnTo: "/parent?tab=gifts" }).success).toBe(
      true,
    );
  });

  it.each(["https://evil.example/x", "//evil.example/x", "/\\evil.example", "parent/children", ""])(
    "refuses a return path that leaves the app: %s",
    (returnTo) => {
      expect(autoChargeSchema.safeParse({ ...valid, returnTo }).success).toBe(false);
    },
  );

  it("refuses an unknown target type", () => {
    expect(autoChargeSchema.safeParse({ ...valid, type: "occurrence" }).success).toBe(false);
  });
});

describe("cardReturnParamsSchema", () => {
  it("reads the provider's return state and ignores anything else", () => {
    expect(cardReturnParamsSchema.parse({ card: "returned" }).card).toBe("returned");
    expect(cardReturnParamsSchema.parse({ card: ["saved", "x"] }).card).toBe("saved");
    expect(cardReturnParamsSchema.parse({ card: "nope" }).card).toBeUndefined();
    expect(cardReturnParamsSchema.parse({}).card).toBeUndefined();
  });
});

describe("fakeCheckoutParamsSchema", () => {
  const app = "http://localhost:3200";
  const params = fakeCheckoutParamsSchema(app);
  const back = `${app}/parent/children/c1/handover/allowance/${id}?card=returned`;
  const query = { mode: "payment", ref: id, success: back, cancel: `${app}/parent?card=cancelled` };

  it("turns same-origin return URLs into in-app paths", () => {
    expect(params.parse(query)).toEqual({
      mode: "payment",
      ref: id,
      success: `/parent/children/c1/handover/allowance/${id}?card=returned`,
      cancel: "/parent?card=cancelled",
    });
    expect(params.parse({ ...query, success: "/parent", mode: ["setup", "payment"] })).toEqual(
      expect.objectContaining({ mode: "setup", success: "/parent" }),
    );
  });

  it.each([
    "https://evil.example/parent",
    "//evil.example/parent",
    "/\\evil.example",
    `${app}//evil.example`,
    "http://localhost:3201/parent",
    "javascript:alert(1)",
    "/.//evil.com",
    "http://localhost:3200@evil.com",
  ])("refuses %s as a return URL", (success) => {
    expect(params.safeParse({ ...query, success }).success).toBe(false);
  });

  it("refuses a bad mode or ref", () => {
    expect(params.safeParse({ ...query, mode: "refund" }).success).toBe(false);
    expect(params.safeParse({ ...query, ref: "fake_cs_1" }).success).toBe(false);
  });
});

describe("fakeCheckoutSchema", () => {
  const schema = fakeCheckoutSchema("http://localhost:3200");
  const base = { ref: id, success: "/parent?card=saved", cancel: "/parent?card=cancelled" };

  it("accepts each mode's own outcomes only", () => {
    expect(schema.safeParse({ ...base, mode: "payment", outcome: "pay" }).success).toBe(true);
    expect(schema.safeParse({ ...base, mode: "setup", outcome: "decline" }).success).toBe(true);
    expect(schema.safeParse({ ...base, mode: "payment", outcome: "ok" }).success).toBe(false);
    expect(schema.safeParse({ ...base, mode: "setup", outcome: "pay" }).success).toBe(false);
  });

  it("refuses an off-site return", () => {
    const off = { ...base, mode: "payment", outcome: "pay", success: "https://evil.example" };
    expect(schema.safeParse(off).success).toBe(false);
  });
});
