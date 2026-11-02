import {
  goalLine,
  goalProgress,
  milestoneCrossed,
  staircaseFor,
  staircaseLabel,
  stepsCaption,
} from "@jarso/core/goals";
import { describe, expect, it } from "vitest";

const money = (minor: number) => `£${minor / 100}`;

describe("staircaseFor", () => {
  it("draws one step per allowance of the plan, climbed steps from the fill", () => {
    const progress = goalProgress({
      saveMinor: 2600,
      reservedMinor: 0,
      targetMinor: 4500,
      planMinor: 400,
    });
    const stair = staircaseFor(progress, 4500, 400);
    // 4500 / 400 rounds up to 12 allowances: 12 steps, one allowance each.
    expect(stair).toEqual({ steps: 12, perStep: 1, filled: 6, coachAt: 6, reached: false });
  });

  it("groups allowances per step past twelve steps, and says so", () => {
    const progress = goalProgress({
      saveMinor: 20000,
      reservedMinor: 0,
      targetMinor: 80000,
      planMinor: 2000,
    });
    const stair = staircaseFor(progress, 80000, 2000);
    expect(stair.steps).toBe(12);
    expect(stair.perStep).toBe(4); // 40 allowances over 12 steps
    expect(stair.filled).toBe(3); // a quarter of the way
    expect(stepsCaption(stair)).toBe("Each step is 4 allowances.");
  });

  it("splits the climb into eight equal steps without a plan", () => {
    const progress = goalProgress({
      saveMinor: 0,
      reservedMinor: 0,
      targetMinor: 4500,
      planMinor: null,
    });
    const stair = staircaseFor(progress, 4500, null);
    expect(stair).toEqual({ steps: 8, perStep: 1, filled: 0, coachAt: 0, reached: false });
    expect(stepsCaption(stair)).toBeNull();
  });

  it("puts the coach on the top step once the goal is reached", () => {
    const progress = goalProgress({
      saveMinor: 4500,
      reservedMinor: 0,
      targetMinor: 4500,
      planMinor: 400,
    });
    const stair = staircaseFor(progress, 4500, 400);
    expect(stair.filled).toBe(12);
    expect(stair.coachAt).toBe(12);
    expect(stair.reached).toBe(true);
  });
});

describe("milestoneCrossed", () => {
  it("names the highest quarter mark passed on the way up, and nothing on the way down", () => {
    expect(milestoneCrossed(0.1, 0.3)).toBe(0.25);
    expect(milestoneCrossed(0.2, 0.8)).toBe(0.75);
    expect(milestoneCrossed(0.9, 1)).toBe(1);
    expect(milestoneCrossed(0.3, 0.4)).toBeNull();
    expect(milestoneCrossed(0.8, 0.2)).toBeNull();
    expect(milestoneCrossed(0.25, 0.25)).toBeNull();
  });
});

describe("goalLine and staircaseLabel", () => {
  it("says about how many allowances, the amount without a plan, or that it is reached", () => {
    expect(goalLine({ reached: false, paymentsLeft: 30, remainingMinor: 60000 }, money)).toBe(
      "About 30 allowances to go",
    );
    expect(goalLine({ reached: false, paymentsLeft: 1, remainingMinor: 400 }, money)).toBe(
      "About 1 allowance to go",
    );
    expect(goalLine({ reached: false, paymentsLeft: null, remainingMinor: 60000 }, money)).toBe(
      "£600 to go",
    );
    expect(goalLine({ reached: true, paymentsLeft: 0, remainingMinor: 0 }, money)).toBe(
      "Reached. Time to ask your parent.",
    );
  });

  it("describes the picture in words", () => {
    const stair = { steps: 12, perStep: 1, filled: 6, coachAt: 6, reached: false };
    expect(staircaseLabel({ name: "Football boots", targetMinor: 4500 }, stair, money)).toBe(
      "Your goal: Football boots, £45. 6 of 12 steps climbed.",
    );
    expect(
      staircaseLabel({ name: "Bike", targetMinor: 12000 }, { ...stair, reached: true }, money),
    ).toBe("Your goal: Bike, £120. every step climbed.");
  });
});
