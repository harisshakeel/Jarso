import {
  allowanceSchema,
  changeAllowanceSchema,
  giftSchema,
  handoverParamsSchema,
  handoverSchema,
  idSchema,
  matchSavingSchema,
  pauseSchema,
  updateGiftSchema,
} from "@jarso/core/allowance";
import { familyToday } from "@jarso/core/lib";
import { describe, expect, it } from "vitest";

const today = "2026-10-29";
const childId = "6f1c2a52-3c4e-4c8e-9a51-0a1b2c3d4e5f";
const id = "0b7e8f40-9d1a-4b2c-8e3f-1a2b3c4d5e6f";

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("allowanceSchema", () => {
  const valid = { childId, amount: "5.50", frequency: "weekly", firstOn: today };

  it("parses the amount to minor units", () => {
    expect(allowanceSchema("GBP", today).parse(valid)).toEqual({
      childId,
      amountMinor: 550,
      frequency: "weekly",
      firstOn: today,
      saveMinor: null,
    });
  });

  it("takes the planned Save in minor units; blank or missing is no plan", () => {
    const schema = allowanceSchema("GBP", today);
    expect(schema.parse({ ...valid, save: "1.25" }).saveMinor).toBe(125);
    expect(schema.parse({ ...valid, save: "0" }).saveMinor).toBe(0);
    expect(schema.parse({ ...valid, save: "" }).saveMinor).toBeNull();
    expect(schema.parse({ ...valid, save: "5.50" }).saveMinor).toBe(550);
  });

  it("refuses a Save over the amount, on the save field", () => {
    const result = allowanceSchema("GBP", today).safeParse({ ...valid, save: "6" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["save"]);
    expect(messages(result)).toEqual(["Save can't be more than the amount."]);
  });

  it("refuses a Save that isn't money", () => {
    const result = allowanceSchema("GBP", today).safeParse({ ...valid, save: "-1" });
    expect(result.error?.issues[0]?.path).toEqual(["save"]);
  });

  it("rejects a past date", () => {
    const result = allowanceSchema("GBP", today).safeParse({ ...valid, firstOn: "2026-10-28" });
    expect(result.success).toBe(false);
  });

  it("rejects an amount more precise than the currency, with a friendly message", () => {
    const result = allowanceSchema("GBP", today).safeParse({ ...valid, amount: "5.555" });
    expect(result.success).toBe(false);
    expect(messages(result)).toContain("Enter an amount like 5 or 5.50.");
  });

  it("uses whole-number copy for zero-decimal currencies", () => {
    const result = allowanceSchema("JPY", today).safeParse({ ...valid, amount: "5.5" });
    expect(messages(result)).toContain("Enter an amount like 500.");
  });

  it("rejects a first date more than 366 days ahead", () => {
    expect(
      allowanceSchema("GBP", today).safeParse({ ...valid, firstOn: "2027-10-30" }).success,
    ).toBe(true);
    const far = allowanceSchema("GBP", today).safeParse({ ...valid, firstOn: "2027-10-31" });
    expect(messages(far)).toContain("Pick a date within a year.");
  });

  it("rejects zero and unknown frequencies", () => {
    expect(allowanceSchema("GBP", today).safeParse({ ...valid, amount: "0" }).success).toBe(false);
    expect(allowanceSchema("GBP", today).safeParse({ ...valid, frequency: "daily" }).success).toBe(
      false,
    );
  });
});

describe("changeAllowanceSchema", () => {
  it("rejects a next date more than 366 days ahead", () => {
    const base = { scheduleId: id, amount: "5", frequency: "weekly" };
    const schema = changeAllowanceSchema("GBP", today);
    expect(schema.safeParse({ ...base, nextOn: "2027-10-30" }).success).toBe(true);
    expect(messages(schema.safeParse({ ...base, nextOn: "2027-10-31" }))).toContain(
      "Pick a date within a year.",
    );
  });

  it("takes the planned Save like a new allowance", () => {
    const base = { scheduleId: id, amount: "5", frequency: "weekly", nextOn: today };
    const schema = changeAllowanceSchema("GBP", today);
    expect(schema.parse(base).saveMinor).toBeNull();
    expect(schema.parse({ ...base, save: "2" }).saveMinor).toBe(200);
    expect(schema.safeParse({ ...base, save: "5.01" }).error?.issues[0]?.path).toEqual(["save"]);
  });
});

describe("giftSchema", () => {
  const valid = { childId, amount: "10", giveOn: today, note: "Well done", idempotencyKey: id };

  it("requires a uuid idempotency key", () => {
    const schema = giftSchema("GBP", today);
    expect(schema.parse(valid).idempotencyKey).toBe(id);
    expect(schema.safeParse({ ...valid, idempotencyKey: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...valid, idempotencyKey: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a note of 141 characters", () => {
    expect(giftSchema("GBP", today).safeParse({ ...valid, note: "x".repeat(141) }).success).toBe(
      false,
    );
    expect(giftSchema("GBP", today).safeParse({ ...valid, note: "x".repeat(140) }).success).toBe(
      true,
    );
  });

  it("turns a blank or missing note into null", () => {
    expect(giftSchema("GBP", today).parse({ ...valid, note: "  " }).note).toBeNull();
    expect(giftSchema("GBP", today).parse({ ...valid, note: undefined }).note).toBeNull();
  });

  it("rejects a past date", () => {
    expect(giftSchema("GBP", today).safeParse({ ...valid, giveOn: "2026-10-01" }).success).toBe(
      false,
    );
  });

  it("rejects a give-on date more than 366 days ahead, new or edited", () => {
    const far = giftSchema("GBP", today).safeParse({ ...valid, giveOn: "2027-10-31" });
    expect(messages(far)).toContain("Pick a date within a year.");
    const edited = updateGiftSchema("GBP", today).safeParse({
      giftId: id,
      amount: "10",
      giveOn: "2027-10-31",
    });
    expect(messages(edited)).toContain("Pick a date within a year.");
  });

  it("lets an edit keep a past date (the service checks a changed one)", () => {
    const result = updateGiftSchema("GBP", today).safeParse({
      giftId: id,
      amount: "10",
      giveOn: "2026-10-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("pauseSchema", () => {
  it("accepts a date within a year, or none (until resumed)", () => {
    expect(pauseSchema(today).parse({ scheduleId: id, through: "2027-10-30" }).through).toBe(
      "2027-10-30",
    );
    const open = pauseSchema(today).parse({ scheduleId: id, through: "", message: " " });
    expect(open).toEqual({ scheduleId: id, through: null, message: null });
  });

  it("rejects a past date and a date more than 366 days ahead", () => {
    const past = pauseSchema(today).safeParse({ scheduleId: id, through: "2026-10-28" });
    expect(messages(past)).toEqual(["Pick today or a later date."]);
    const far = pauseSchema(today).safeParse({ scheduleId: id, through: "2027-10-31" });
    expect(messages(far)).toContain("Pick a date within a year.");
  });
});

describe("handoverSchema", () => {
  const valid = { kind: "allowance", id, cash: "3", saved: "2", idempotencyKey: id };

  it("parses both jars to minor units", () => {
    expect(handoverSchema("GBP").parse(valid)).toEqual({
      kind: "allowance",
      id,
      cashMinor: 300,
      savedMinor: 200,
      idempotencyKey: id,
    });
  });

  it("allows one jar to be zero", () => {
    expect(handoverSchema("GBP").safeParse({ ...valid, saved: "0" }).success).toBe(true);
  });

  it("rejects a handover where cash + saved = 0", () => {
    expect(handoverSchema("GBP").safeParse({ ...valid, cash: "0", saved: "0" }).success).toBe(
      false,
    );
  });

  it("rejects a missing idempotency key", () => {
    expect(handoverSchema("GBP").safeParse({ ...valid, idempotencyKey: "" }).success).toBe(false);
  });

  it("accepts a jar at the database cap and rejects one above it, on that field", () => {
    expect(handoverSchema("GBP").safeParse({ ...valid, cash: "1000000000" }).success).toBe(true);
    const result = handoverSchema("GBP").safeParse({ ...valid, cash: "1000000000.01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["cash"]);
    expect(messages(result)).toContain("Enter an amount up to £1,000,000,000.");
  });
});

describe("familyToday", () => {
  it("uses the family's timezone", () => {
    const now = new Date("2026-10-29T23:30:00Z");
    expect(familyToday("Europe/London", now)).toBe("2026-10-29");
    expect(familyToday("Asia/Kolkata", now)).toBe("2026-10-30");
  });
});

describe("idSchema", () => {
  it("requires a uuid", () => {
    expect(idSchema.safeParse({ id }).success).toBe(true);
    expect(idSchema.safeParse({ id: "nope" }).success).toBe(false);
  });
});

describe("handoverParamsSchema", () => {
  it("accepts an allowance or gift kind with a uuid", () => {
    expect(handoverParamsSchema.safeParse({ kind: "allowance", id }).success).toBe(true);
    expect(handoverParamsSchema.safeParse({ kind: "gift", id }).success).toBe(true);
  });

  it("rejects an unknown kind or a non-uuid id", () => {
    expect(handoverParamsSchema.safeParse({ kind: "foo", id }).success).toBe(false);
    expect(handoverParamsSchema.safeParse({ kind: "gift", id: "123" }).success).toBe(false);
  });
});

describe("matchSavingSchema", () => {
  const valid = { childId, amount: "8", message: "  I matched it!  ", idempotencyKey: id };
  it("reads the amount in minor units and trims the note", () => {
    expect(matchSavingSchema("GBP").parse(valid)).toEqual({
      childId,
      amountMinor: 800,
      message: "I matched it!",
      idempotencyKey: id,
    });
  });
  it("treats a blank note as none", () => {
    expect(matchSavingSchema("GBP").parse({ ...valid, message: "" }).message).toBeNull();
  });
  it("refuses nothing to add, a long note and a missing key", () => {
    const schema = matchSavingSchema("GBP");
    expect(schema.safeParse({ ...valid, amount: "0" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, message: "x".repeat(141) }).success).toBe(false);
    expect(schema.safeParse({ ...valid, idempotencyKey: undefined }).success).toBe(false);
  });
});
