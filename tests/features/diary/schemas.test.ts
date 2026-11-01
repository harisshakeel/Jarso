import { describe, expect, it } from "vitest";
import { fixSchema, purchaseSchema, receivedSchema, undoSchema } from "@/features/diary/schemas";

const uuid = "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f";
const schema = purchaseSchema("GBP");

describe("purchaseSchema", () => {
  it("parses amount and label", () => {
    expect(schema.parse({ amount: "3.20", label: " Snack ", idempotencyKey: uuid })).toEqual({
      amountMinor: 320,
      label: "Snack",
      idempotencyKey: uuid,
      category: "other",
    });
  });

  it("defaults category to other and rejects a received key", () => {
    expect(schema.parse({ amount: "3", idempotencyKey: uuid }).category).toBe("other");
    expect(schema.parse({ amount: "3", category: "snacks", idempotencyKey: uuid }).category).toBe(
      "snacks",
    );
    expect(
      schema.safeParse({ amount: "3", category: "birthday", idempotencyKey: uuid }).success,
    ).toBe(false);
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

describe("purchaseSchema occurredAt", () => {
  it("drops a client occurredAt: only the server sets the time", () => {
    const occurredAt = "2026-10-29T18:30:00.000+01:00";
    expect(schema.parse({ amount: "3", idempotencyKey: uuid, occurredAt })).not.toHaveProperty(
      "occurredAt",
    );
  });
});

describe("undoSchema", () => {
  it("needs an entry id", () => {
    expect(undoSchema.parse({ entryId: uuid })).toEqual({ entryId: uuid });
    expect(undoSchema.safeParse({ entryId: "x" }).success).toBe(false);
  });
});

describe("receivedSchema", () => {
  const received = receivedSchema("GBP");
  const base = { amount: "20", jar: "save", category: "birthday", idempotencyKey: uuid };

  it("parses amount, jar and category", () => {
    expect(received.parse({ ...base, label: " Nani " })).toEqual({
      amountMinor: 2000,
      jar: "save",
      category: "birthday",
      label: "Nani",
      idempotencyKey: uuid,
    });
  });

  it("rejects a missing category, jar both and a spend-only category", () => {
    expect(received.safeParse({ ...base, category: undefined }).success).toBe(false);
    expect(received.safeParse({ ...base, jar: "both" }).success).toBe(false);
    expect(received.safeParse({ ...base, category: "snacks" }).success).toBe(false);
  });
});

describe("fixSchema", () => {
  const fix = fixSchema("GBP");
  const base = { entryId: uuid, amount: "3.50", category: "snacks", idempotencyKey: uuid };

  it("parses a fix", () => {
    expect(fix.parse(base)).toEqual({
      entryId: uuid,
      amountMinor: 350,
      category: "snacks",
      label: undefined,
      idempotencyKey: uuid,
    });
  });

  it("requires a uuid entryId and a category", () => {
    expect(fix.safeParse({ ...base, entryId: "x" }).success).toBe(false);
    expect(fix.safeParse({ ...base, category: undefined }).success).toBe(false);
  });
});
