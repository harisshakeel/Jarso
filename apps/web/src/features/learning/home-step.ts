import type { GoalView } from "@/features/goals";
import type { NextStep } from "./types";

/** The one thing child Home offers next (spec §6.1). */
export type HomeStep =
  | { kind: "goal-reached"; goalId: string; name: string; emoji: string }
  | { kind: "withdrawal-approved"; amountMinor: number }
  | { kind: "learning"; step: NextStep }
  | { kind: "set-goal" }
  | { kind: "all-done" };

/**
 * Order: a goal reached and not yet celebrated, a withdrawal a parent said yes to, the learning
 * order already shipped (FR12), a nudge to set a goal, then all done.
 */
export function chooseHomeStep(input: {
  goal: GoalView;
  approvedWithdrawal: { amountMinor: number } | null;
  learning: NextStep;
}): HomeStep {
  const { goal, approvedWithdrawal, learning } = input;
  if (goal?.progress.reached && !goal.goal.celebratedAt) {
    return {
      kind: "goal-reached",
      goalId: goal.goal.id,
      name: goal.goal.name,
      emoji: goal.goal.emoji,
    };
  }
  if (approvedWithdrawal)
    return { kind: "withdrawal-approved", amountMinor: approvedWithdrawal.amountMinor };
  if (learning.kind !== "done") return { kind: "learning", step: learning };
  if (!goal) return { kind: "set-goal" };
  return { kind: "all-done" };
}
