import { dashboardCopy, goalLine, parentPageCopy, weekday } from "@jarso/core/dashboard";
import type { GoalView } from "@jarso/core/goals";
import { describe, expect, it } from "vitest";

describe("dashboard copy", () => {
  it("keeps every line", () => {
    expect({ dashboardCopy, parentPageCopy }).toMatchSnapshot();
  });

  it("weekday reads a date with its day", () => {
    expect(weekday("2026-11-01")).toMatch(/^Sun /);
  });

  it("goalLine: none, on its way, reached", () => {
    const money = (minor: number) => `£${minor / 100}`;
    const view = (reached: boolean) =>
      ({
        goal: { emoji: "🚲", name: "Bike", targetMinor: 2000 },
        progress: { reached, countedMinor: 400 },
      }) as unknown as GoalView;
    expect(goalLine(null, money)).toBe("No goal yet");
    expect(goalLine(view(false), money)).toBe("🚲 Bike: £4 of £20");
    expect(goalLine(view(true), money)).toBe("🚲 Bike: reached");
  });
});
