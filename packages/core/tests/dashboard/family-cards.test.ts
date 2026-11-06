import { childCardLine, familyCardsCopy, goalPercent, weekMissions } from "@jarso/core/dashboard";
import type { GoalView } from "@jarso/core/goals";
import { describe, expect, it } from "vitest";

type Status = "done" | "current" | "locked";
const journey = (statuses: Status[]) =>
  statuses.map((status, i) => ({ key: `m${i + 1}`, day: i + 1, title: `M${i + 1}`, status }));

const goal = (fillRatio: number, reached = false) =>
  ({
    goal: { emoji: "⚽", name: "Boots", targetMinor: 2000 },
    progress: { fillRatio, reached, countedMinor: 0, remainingMinor: 0, paymentsLeft: null },
  }) as unknown as GoalView;

describe("childCardLine", () => {
  it("the line has level, streak and the week's missions", () => {
    expect(childCardLine({ level: 4, streak: 5, missions: { done: 3, total: 7 } })).toBe(
      "Level 4 · 5-day streak · Missions 3/7",
    );
  });

  it("a zero streak is never mentioned", () => {
    expect(childCardLine({ level: 2, streak: 0, missions: null })).toBe("Level 2");
  });

  it("missing progress leaves level and streak out", () => {
    expect(childCardLine({ level: null, streak: null, missions: { done: 1, total: 7 } })).toBe(
      "Missions 1/7",
    );
  });

  it("nothing known is null", () => {
    expect(childCardLine({ level: null, streak: null, missions: null })).toBeNull();
  });
});

describe("weekMissions", () => {
  it("week missions follow the quest week holding the current stop", () => {
    expect(
      weekMissions(journey(["done", "done", "done", "current", "locked", "locked", "locked"])),
    ).toEqual({
      done: 3,
      total: 7,
    });
    const eight = journey([..."ddddddd".split("").map(() => "done" as const), "current"]);
    expect(weekMissions(eight)).toEqual({ done: 0, total: 1 });
  });

  it("an empty journey has no missions", () => {
    expect(weekMissions([])).toBeNull();
  });
});

describe("goalPercent", () => {
  it("goal percent floors, caps at 100, and is null with no goal", () => {
    expect(goalPercent(goal(0.759))).toBe(75);
    expect(goalPercent(goal(1.4))).toBe(100);
    expect(goalPercent(goal(0.99, true))).toBe(100);
    expect(goalPercent(goal(-0.2))).toBe(0);
    expect(goalPercent(null)).toBeNull();
  });
});

describe("familyCardsCopy", () => {
  it("counts what needs the parent", () => {
    expect(familyCardsCopy.needsYou(2)).toBe("Needs you · 2");
    expect(familyCardsCopy.needsYou(0)).toBe("Needs you");
    expect(familyCardsCopy.dueLine("3 Nov", null)).toBe("Due 3 Nov");
    expect(familyCardsCopy.dueLine("3 Nov", "Birthday")).toBe("Due 3 Nov · Birthday");
    expect(familyCardsCopy.handoverTitle("£3", "Sam")).toBe("£3 to Sam");
    expect(familyCardsCopy.streak(1)).toBe("1-day streak");
  });

  it("the copy never mentions sparks, rank or compare", () => {
    const samples = [
      childCardLine({ level: 4, streak: 5, missions: { done: 3, total: 7 } }),
      familyCardsCopy.childLabel("Sam", "Level 4", "£1", "£2", "75%"),
      familyCardsCopy.needsYou(3),
      familyCardsCopy.unread(2),
      JSON.stringify(familyCardsCopy),
    ];
    for (const text of samples) expect(text).not.toMatch(/spark|rank|best|top|than/i);
  });
});
