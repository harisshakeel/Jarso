import {
  goalCopy,
  goalProgress,
  starsLit,
  starToCheer,
  toGoLine,
  weeksToGoal,
} from "@jarso/core/goals";
import { describe, expect, it } from "vitest";

const money = (minor: number) => `₹${minor / 100}`;
const fill = (fillRatio: number, reached = false) => ({ fillRatio, reached });

describe("starsLit", () => {
  it("counts quarter marks", () => {
    expect(starsLit(fill(0))).toBe(0);
    expect(starsLit(fill(0.249))).toBe(0);
    expect(starsLit(fill(0.25))).toBe(1);
    expect(starsLit(fill(0.74))).toBe(2);
    expect(starsLit(fill(0.99))).toBe(3);
    expect(starsLit(fill(1, true))).toBe(4);
  });

  it("is 4 when saved more than the target", () => {
    const progress = goalProgress({
      saveMinor: 9000,
      reservedMinor: 0,
      targetMinor: 5000,
      planMinor: null,
    });
    expect(starsLit(progress)).toBe(4);
  });
});

describe("starToCheer", () => {
  it("is silent on first sight", () => expect(starToCheer(null, 2)).toBeNull());
  it("cheers a new star", () => expect(starToCheer(1, 2)).toBe(0.5));
  it("cheers once for the highest when the target is lowered", () =>
    expect(starToCheer(1, 3)).toBe(0.75));
  it("does nothing when nothing new lit", () => expect(starToCheer(2, 2)).toBeNull());
  it("never cheers when stars go down", () => expect(starToCheer(3, 1)).toBeNull());
  it("leaves the fourth star to the goal celebration", () => expect(starToCheer(3, 4)).toBeNull());
});

describe("weeksToGoal", () => {
  it("weekly equals allowances to go", () => {
    const progress = goalProgress({
      saveMinor: 1000,
      reservedMinor: 0,
      targetMinor: 12100,
      planMinor: 3000,
    });
    expect(
      weeksToGoal({
        remainingMinor: progress.remainingMinor,
        planMinor: 3000,
        frequency: "weekly",
      }),
    ).toBe(progress.paymentsLeft);
  });

  it("monthly", () => {
    expect(weeksToGoal({ remainingMinor: 11000, planMinor: 5000, frequency: "monthly" })).toBe(10);
  });

  it("is null without a plan, a frequency, or when nothing is left", () => {
    expect(weeksToGoal({ remainingMinor: 100, planMinor: null, frequency: "weekly" })).toBeNull();
    expect(weeksToGoal({ remainingMinor: 100, planMinor: 0, frequency: "weekly" })).toBeNull();
    expect(weeksToGoal({ remainingMinor: 100, planMinor: 50, frequency: null })).toBeNull();
    expect(weeksToGoal({ remainingMinor: 0, planMinor: 50, frequency: "weekly" })).toBeNull();
  });
});

describe("toGoLine", () => {
  const left = { remainingMinor: 11000, reached: false };
  it("says weeks, singular and plural", () => {
    expect(toGoLine(left, 4, money)).toBe("₹110 to go · about 4 weeks");
    expect(toGoLine(left, 1, money)).toBe("₹110 to go · about 1 week");
  });
  it("drops the weeks without an estimate", () =>
    expect(toGoLine(left, null, money)).toBe("₹110 to go"));
  it("is null when reached", () =>
    expect(toGoLine({ remainingMinor: 0, reached: true }, 3, money)).toBeNull());
});

describe("goal page copy", () => {
  const words = (text: string) => text.trim().split(/\s+/).length;
  it("stays within the word budget", () => {
    const page = goalCopy.page;
    for (const label of [
      page.heading,
      page.reachedTitle,
      page.keepSaving,
      page.saveSome,
      ...page.stars,
    ]) {
      expect(words(label)).toBeLessThanOrEqual(3);
    }
    for (const sentence of [
      page.askToBuy("Mum"),
      page.reachedSub("₹450", "bike"),
      page.starTitle(0.25),
      page.starTitle(0.5),
      page.starTitle(0.75),
    ]) {
      expect(words(sentence)).toBeLessThanOrEqual(8);
    }
    expect(page.starTitle(0.5)).toBe("Halfway there!");
    expect(page.starsLabel(2)).toBe("2 of 4 stars");
    expect(goalCopy.card.toGo("₹110")).toBe("₹110 to go");
  });
});
