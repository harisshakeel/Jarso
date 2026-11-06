import { checkinAnswerSchema, childFacingNameSchema, progressSchema } from "@jarso/core/progress";
import { describe, expect, it } from "vitest";

const sample = {
  sparks: 175,
  level: 2,
  nextLevelAt: 250,
  streak: 3,
  bestStreak: 5,
  restUsedThisWeek: false,
  checkedInToday: true,
  look: { lid: "grape", wear: "cap" },
  badges: [
    { key: "first_log", earnedAt: "2026-11-06T10:00:00Z" },
    { key: "mystery_badge", earnedAt: "2026-11-06T10:00:00Z" },
  ],
  recent: [{ kind: "log", amount: 10, createdAt: "2026-11-06T10:00:00Z" }],
};

describe("progressSchema", () => {
  it("parses a sample and drops unknown badges", () => {
    const p = progressSchema.parse(sample);
    expect(p.badges.map((b) => b.key)).toEqual(["first_log"]);
    expect(p.look.wear).toBe("cap");
  });
  it("falls back on an unknown look value instead of failing", () => {
    const p = progressSchema.parse({ ...sample, look: { lid: "rainbow", wear: "cape" } });
    expect(p.look).toEqual({ lid: "cyan", wear: "none" });
    expect(progressSchema.parse({ ...sample, look: { lid: "grape", wear: "cape" } }).look).toEqual({
      lid: "grape",
      wear: "none",
    });
  });
  it("allows a null nextLevelAt", () => {
    expect(
      progressSchema.parse({ ...sample, level: 10, nextLevelAt: null }).nextLevelAt,
    ).toBeNull();
  });
});

describe("checkinAnswerSchema", () => {
  it("accepts yes and nope only", () => {
    expect(checkinAnswerSchema.parse("yes")).toBe("yes");
    expect(checkinAnswerSchema.safeParse("maybe").success).toBe(false);
  });
});

describe("childFacingNameSchema", () => {
  it("trims, bounds and is optional", () => {
    expect(childFacingNameSchema.parse(" Mum ")).toBe("Mum");
    expect(childFacingNameSchema.safeParse("").success).toBe(false);
    expect(childFacingNameSchema.safeParse("x".repeat(21)).success).toBe(false);
    expect(childFacingNameSchema.parse(null)).toBeNull();
    expect(childFacingNameSchema.parse(undefined)).toBeUndefined();
  });
});
