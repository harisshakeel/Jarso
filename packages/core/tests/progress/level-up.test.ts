import { levelUpCopy, levelUpDecision, newWear } from "@jarso/core/progress";
import { describe, expect, it } from "vitest";

describe("levelUpDecision", () => {
  it("first read only remembers", () => {
    expect(levelUpDecision(null, 4)).toBe("remember");
  });
  it("a rise celebrates", () => {
    expect(levelUpDecision(2, 3)).toBe("celebrate");
  });
  it("same level does nothing", () => {
    expect(levelUpDecision(3, 3)).toBe("none");
  });
  it("a lower level is remembered quietly", () => {
    expect(levelUpDecision(5, 4)).toBe("remember");
  });
});

describe("newWear", () => {
  it("newWear gives shades at 3, headphones at 4, crown at 5", () => {
    expect(newWear(2, 3)).toBe("shades");
    expect(newWear(3, 4)).toBe("headphones");
    expect(newWear(4, 5)).toBe("crown");
  });
  it("a jump from 2 to 4 gives the newest wear, headphones", () => {
    expect(newWear(2, 4)).toBe("headphones");
  });
  it("no wear in a range with none (5 to 7)", () => {
    expect(newWear(5, 7)).toBeNull();
    expect(newWear(1, 2)).toBeNull();
  });
});

describe("levelUpCopy", () => {
  it("the title uses the level name", () => {
    expect(levelUpCopy.title(5, "Money Maker")).toBe("Level 5! Money Maker");
    expect(levelUpCopy.unlocked("Crown")).toBe("Crown unlocked");
  });
});
