import {
  availableWear,
  JARSO_MOODS,
  type JarsoMoment,
  jarsoFill,
  moodFor,
  parseLook,
  wearUnlocked,
} from "@jarso/core/mascot";
import { describe, expect, it } from "vitest";

describe("jarsoFill", () => {
  it("is save over the goal target when there is a goal", () => {
    expect(jarsoFill({ saveMinor: 30000, spendMinor: 0, goalTargetMinor: 45000 })).toBeCloseTo(
      2 / 3,
    );
  });
  it("clamps at 1 and 0", () => {
    expect(jarsoFill({ saveMinor: 50000, spendMinor: 0, goalTargetMinor: 45000 })).toBe(1);
    expect(jarsoFill({ saveMinor: -100, spendMinor: 0, goalTargetMinor: null })).toBe(0);
  });
  it("is 0 when both jars are empty", () => {
    expect(jarsoFill({ saveMinor: 0, spendMinor: 0, goalTargetMinor: null })).toBe(0);
  });
  it("is save over total without a goal", () => {
    expect(jarsoFill({ saveMinor: 100, spendMinor: 300, goalTargetMinor: null })).toBe(0.25);
  });
});

describe("wear", () => {
  it("unlocks by level", () => {
    expect(wearUnlocked("crown", 4)).toBe(false);
    expect(wearUnlocked("crown", 5)).toBe(true);
  });
  it("lists what a level can wear", () => {
    expect(availableWear(1)).toEqual(["none", "cap"]);
  });
});

describe("parseLook", () => {
  it("falls back per bad field", () => {
    expect(parseLook({ lid: "pink", wear: "cap" })).toEqual({ lid: "cyan", wear: "cap" });
    expect(parseLook(null)).toEqual({ lid: "cyan", wear: "none" });
  });
});

describe("moodFor", () => {
  it("thinks on a wrong answer", () => {
    expect(moodFor("answerWrong")).toBe("think");
  });
  it("only returns known moods", () => {
    const moments: JarsoMoment[] = [
      "rest",
      "logged",
      "saved",
      "milestone",
      "goalReached",
      "levelUp",
      "answerRight",
      "answerWrong",
      "waiting",
      "empty",
      "greeting",
    ];
    for (const m of moments) expect(JARSO_MOODS).toContain(moodFor(m));
  });
});
