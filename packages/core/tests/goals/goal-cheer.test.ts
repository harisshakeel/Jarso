import { goalCheer } from "@jarso/core/goals";
import { describe, expect, it } from "vitest";

const money = (minor: number) => `£${minor / 100}`;
const at = (fillRatio: number, paymentsLeft: number | null, remainingMinor = 1000) => ({
  reached: fillRatio >= 1,
  fillRatio,
  paymentsLeft,
  remainingMinor,
});

describe("goalCheer", () => {
  it("gets more excited as the goal gets closer", () => {
    expect(goalCheer(at(0.1, 28), money)).toBe(
      "Great start! 28 more pocket money days and it's yours",
    );
    expect(goalCheer(at(0.5, 14), money)).toBe("Keep going! 14 more pocket money days");
    expect(goalCheer(at(0.8, 3), money)).toBe("Almost there! Just 3 more pocket money days");
    expect(goalCheer(at(0.95, 1), money)).toBe("So close! Just 1 more pocket money day");
    expect(goalCheer(at(1, 0), money)).toBe("You did it!");
  });

  it("counts the money left when there is no saving plan", () => {
    expect(goalCheer(at(0.3, null, 550), money)).toBe("Keep going! £5.5 more");
  });
});
