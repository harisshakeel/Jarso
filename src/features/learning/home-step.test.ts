import { describe, expect, it } from "vitest";
import type { GoalView } from "@/features/goals";
import { goalProgress } from "@/features/goals";
import { chooseHomeStep } from "./home-step";
import type { NextStep } from "./types";

const mission: NextStep = { kind: "mission", missionKey: "m3", title: "Needs or wants", day: 3 };
const done: NextStep = { kind: "done" };

function goal(saveMinor: number, celebratedAt: string | null = null): GoalView {
  return {
    goal: {
      id: "g1",
      name: "Football boots",
      emoji: "⚽",
      targetMinor: 4500,
      planMinor: 400,
      reachedAt: saveMinor >= 4500 ? "2026-10-31T00:00:00Z" : null,
      celebratedAt,
    },
    progress: goalProgress({ saveMinor, reservedMinor: 0, targetMinor: 4500, planMinor: 400 }),
  };
}

describe("chooseHomeStep", () => {
  it("celebrates a reached goal first, once", () => {
    expect(
      chooseHomeStep({
        goal: goal(5000),
        approvedWithdrawal: { amountMinor: 500 },
        learning: mission,
      }),
    ).toEqual({
      kind: "goal-reached",
      goalId: "g1",
      name: "Football boots",
      emoji: "⚽",
    });
  });

  it("tells the child a parent said yes before learning", () => {
    expect(
      chooseHomeStep({
        goal: goal(100),
        approvedWithdrawal: { amountMinor: 500 },
        learning: mission,
      }),
    ).toEqual({
      kind: "withdrawal-approved",
      amountMinor: 500,
    });
  });

  it("keeps the learning order next", () => {
    expect(
      chooseHomeStep({ goal: goal(100), approvedWithdrawal: null, learning: mission }),
    ).toEqual({
      kind: "learning",
      step: mission,
    });
  });

  it("suggests a goal when learning is done and there is none", () => {
    expect(chooseHomeStep({ goal: null, approvedWithdrawal: null, learning: done })).toEqual({
      kind: "set-goal",
    });
  });

  it("is all done when the goal was already celebrated and learning is done", () => {
    expect(
      chooseHomeStep({
        goal: goal(5000, "2026-10-31T01:00:00Z"),
        approvedWithdrawal: null,
        learning: done,
      }),
    ).toEqual({ kind: "all-done" });
  });
});
