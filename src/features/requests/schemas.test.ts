import { describe, expect, it } from "vitest";
import {
  completeSchema,
  decideSchema,
  depositSchema,
  rejectDepositSchema,
  withdrawalSchema,
} from "./schemas";

const uuid = "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f";

describe("withdrawalSchema", () => {
  const schema = withdrawalSchema("GBP");
  it("parses amount and trims the reason", () => {
    expect(schema.parse({ amount: "5", reason: " Game ", idempotencyKey: uuid })).toEqual({
      amountMinor: 500,
      reason: "Game",
      idempotencyKey: uuid,
    });
  });
  it("rejects a 141 character reason and accepts 140", () => {
    expect(
      schema.safeParse({ amount: "5", reason: "a".repeat(141), idempotencyKey: uuid }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ amount: "5", reason: "a".repeat(140), idempotencyKey: uuid }).success,
    ).toBe(true);
  });
  it("rejects an amount of 0", () => {
    expect(schema.safeParse({ amount: "0", idempotencyKey: uuid }).success).toBe(false);
  });
});

describe("depositSchema", () => {
  it("rejects 0 and parses money", () => {
    const schema = depositSchema("GBP");
    expect(schema.safeParse({ amount: "0", idempotencyKey: uuid }).success).toBe(false);
    expect(schema.parse({ amount: "2.50", idempotencyKey: uuid }).amountMinor).toBe(250);
  });
});

describe("decideSchema", () => {
  it("refuses a missing or malformed approve instead of reading it as no", () => {
    for (const approve of [undefined, "", "yes", "on", 1, null]) {
      expect(decideSchema.safeParse({ requestId: uuid, approve }).success).toBe(false);
    }
    expect(decideSchema.parse({ requestId: uuid, approve: true }).approve).toBe(true);
    expect(decideSchema.parse({ requestId: uuid, approve: false }).approve).toBe(false);
  });

  it("reads approve from form strings and limits the note", () => {
    expect(decideSchema.parse({ requestId: uuid, approve: "false" }).approve).toBe(false);
    expect(decideSchema.parse({ requestId: uuid, approve: "true", note: " ok " }).note).toBe("ok");
    expect(
      decideSchema.safeParse({ requestId: uuid, approve: "true", note: "a".repeat(141) }).success,
    ).toBe(false);
  });
});

describe("completeSchema", () => {
  it("needs both ids", () => {
    expect(completeSchema.safeParse({ requestId: uuid }).success).toBe(false);
    expect(completeSchema.safeParse({ requestId: uuid, idempotencyKey: uuid }).success).toBe(true);
  });
});

describe("rejectDepositSchema", () => {
  it("takes an optional note up to 140 characters", () => {
    expect(rejectDepositSchema.parse({ requestId: uuid }).note).toBeUndefined();
    expect(rejectDepositSchema.parse({ requestId: uuid, note: " no " }).note).toBe("no");
    expect(rejectDepositSchema.safeParse({ requestId: uuid, note: "a".repeat(141) }).success).toBe(
      false,
    );
  });
});
