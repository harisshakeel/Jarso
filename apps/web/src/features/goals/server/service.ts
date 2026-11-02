import "server-only";
// Savings goal (FR02): the child's own goal, read by the child and their parents.
import { cache } from "react";
import { assertRole, assertSelfOrParentOf } from "@/features/family/server";
import { createClient } from "@/lib/supabase/server";
import { goalProgress } from "../progress";
import type { GoalInput, GoalView } from "../types";
import {
  callArchiveGoal,
  callGoalProgress,
  callMarkCelebrated,
  callSaveGoal,
  findActiveGoal,
} from "./repository";

/** The child's active goal with progress, or null. Readable by the child and their parents. */
export const getGoalView = cache(async (childId: string): Promise<GoalView> => {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
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
});

export async function saveGoal(input: GoalInput): Promise<string> {
  await assertRole("child");
  return callSaveGoal(await createClient(), input);
}

export async function archiveGoal(goalId: string): Promise<void> {
  await assertRole("child");
  await callArchiveGoal(await createClient(), goalId);
}

export async function markCelebrated(goalId: string): Promise<void> {
  await assertRole("child");
  await callMarkCelebrated(await createClient(), goalId);
}
