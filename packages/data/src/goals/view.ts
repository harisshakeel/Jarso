import { type GoalView, goalProgress } from "@jarso/core/goals";
import { type Client, callGoalProgress, findActiveGoal } from "./repository";

/** The child's active goal with progress, or null. Callers check who may read it. */
export async function getGoalView(db: Client, childId: string): Promise<GoalView | null> {
  // Progress first: it records reached_at, which the goal row then carries.
  const progress = await callGoalProgress(db, childId);
  const goal = await findActiveGoal(db, childId);
  if (!goal || !progress) return null;
  return {
    goal,
    progress: goalProgress({
      saveMinor: progress.countedMinor,
      reservedMinor: 0,
      targetMinor: goal.targetMinor,
      planMinor: goal.planMinor,
    }),
  };
}
