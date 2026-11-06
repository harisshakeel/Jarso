import {
  DAILY_CAPS,
  GOAL_REACHED_COOLDOWN_DAYS,
  LEVEL_NAMES,
  LEVEL_THRESHOLDS,
  levelFor,
  levelProgress,
  parentLabel,
  progressCopy,
  SPARKS,
  wearForLevel,
} from "@jarso/core/progress";
import { describe, expect, it } from "vitest";

describe("constants", () => {
  it("match the database mirrors", () => {
    expect(SPARKS).toEqual({
      log: 10,
      checkin: 5,
      step: 15,
      save: 20,
      goalMilestone: 25,
      goalReached: 100,
    });
    expect(DAILY_CAPS).toEqual({ log: 3, checkin: 1, step: 20, save: 2 });
    expect(GOAL_REACHED_COOLDOWN_DAYS).toBe(7);
    expect(LEVEL_THRESHOLDS).toHaveLength(10);
    expect(LEVEL_NAMES).toHaveLength(10);
  });
});

describe("levelFor", () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [3199, 9],
    [3200, 10],
    [99999, 10],
    [-5, 1],
    [Number.NaN, 1],
  ])("%s sparks is level %s", (sparks, level) => {
    expect(levelFor(sparks)).toBe(level);
  });
});

describe("levelProgress", () => {
  it("is halfway through level 2 at 175", () => {
    expect(levelProgress(175)).toEqual({
      level: 2,
      name: "Coin Spotter",
      nextAt: 250,
      toNext: 75,
      share: 0.5,
    });
  });
  it("is full at the top", () => {
    const p = levelProgress(5000);
    expect(p.level).toBe(10);
    expect(p.nextAt).toBeNull();
    expect(p.toNext).toBeNull();
    expect(p.share).toBe(1);
  });
});

describe("parentLabel", () => {
  it("falls back to your parent", () => {
    expect(parentLabel(null)).toBe("your parent");
    expect(parentLabel(undefined)).toBe("your parent");
    expect(parentLabel("Mum")).toBe("Mum");
  });
});

describe("progressCopy", () => {
  it("formats and never shames", () => {
    expect(progressCopy.levelUp(3, "Smart Saver")).toBe("Level 3! Smart Saver");
    expect(progressCopy.streakDays(4)).toBe("4 days");
    const all = [
      progressCopy.checkinQuestion,
      progressCopy.nope,
      progressCopy.yes,
      progressCopy.restDay,
      progressCopy.levelUp(2, "Coin Spotter"),
      progressCopy.streakDays(3),
    ].join(" ");
    expect(all).not.toMatch(/lost|broke|fail/i);
  });
});

describe("wearForLevel", () => {
  it("unlocks outfits by level", () => {
    expect(wearForLevel(1)).toEqual(["none", "cap"]);
    expect(wearForLevel(5)).toContain("crown");
  });
});
