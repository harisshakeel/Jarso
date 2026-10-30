import { describe, expect, it } from "vitest";
import { purchaseSchema, undoSchema } from "./schemas";

const uuid = "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f";
const schema = purchaseSchema("GBP");

describe("purchaseSchema", () => {
  it("parses amount and label", () => {
    expect(schema.parse({ amount: "3.20", label: " Snack ", idempotencyKey: uuid })).toEqual({
      amountMinor: 320,
      label: "Snack",
      idempotencyKey: uuid,
    });
  });

  it("turns a blank label into undefined", () => {
    expect(schema.parse({ amount: "3", label: "  ", idempotencyKey: uuid }).label).toBeUndefined();
    expect(schema.parse({ amount: "3", idempotencyKey: uuid }).label).toBeUndefined();
  });

  it("rejects a 61 character label, bad money and a bad key", () => {
    expect(
      schema.safeParse({ amount: "3", label: "a".repeat(61), idempotencyKey: uuid }).success,
    ).toBe(false);
    expect(schema.safeParse({ amount: "5.555", idempotencyKey: uuid }).success).toBe(false);
    expect(schema.safeParse({ amount: "0", idempotencyKey: uuid }).success).toBe(false);
    expect(schema.safeParse({ amount: "3", idempotencyKey: "nope" }).success).toBe(false);
  });

  it("accepts a 60 character label", () => {
    expect(
      schema.safeParse({ amount: "3", label: "a".repeat(60), idempotencyKey: uuid }).success,
    ).toBe(true);
  });
});

describe("undoSchema", () => {
  it("needs an entry id", () => {
    expect(undoSchema.parse({ entryId: uuid })).toEqual({ entryId: uuid });
    expect(undoSchema.safeParse({ entryId: "x" }).success).toBe(false);
  });
});
