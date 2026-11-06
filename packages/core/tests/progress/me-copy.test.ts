import { BADGE_KEYS, badgeShelf, meCopy } from "@jarso/core/progress";
import { describe, expect, it } from "vitest";

describe("meCopy", () => {
  it("level line and next level", () => {
    expect(meCopy.level(4, "Coin Keeper")).toBe("Level 4 · Coin Keeper");
    expect(meCopy.toNext(60, 5)).toBe("60 ⚡ to Level 5");
    expect(meCopy.badgeCount(6, 23)).toBe("6 of 23");
    expect(meCopy.badgeEarned("First Save")).toBe("First Save, earned");
    expect(meCopy.badgeLocked("First Save")).toBe("First Save, not yet");
  });

  it("keeps the old sign-in line word for word", () => {
    expect(meCopy.signIn("Maya")).toBe(
      "You sign in as Maya. A parent can change your nickname or PIN.",
    );
    expect(meCopy.signIn(null)).toBe(
      "Your nickname is how you sign in. A parent can change your nickname or PIN.",
    );
  });
});

describe("badgeShelf", () => {
  it("badgeShelf puts earned first, keeps every badge once", () => {
    const shelf = badgeShelf([
      { key: "streak_3", earnedAt: "2026-11-05T10:00:00Z" },
      { key: "first_save", earnedAt: "2026-11-01T10:00:00Z" },
    ]);
    expect(shelf).toHaveLength(BADGE_KEYS.length);
    expect(new Set(shelf.map((b) => b.key)).size).toBe(BADGE_KEYS.length);
    expect(shelf.slice(0, 3)).toEqual([
      { key: "first_save", earned: true },
      { key: "streak_3", earned: true },
      { key: "first_log", earned: false },
    ]);
  });
});
