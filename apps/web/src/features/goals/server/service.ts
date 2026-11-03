import "server-only";
import type { GoalInput, GoalView } from "@jarso/core/goals";
import { getGoalView as loadGoalView } from "@jarso/data/goals";
// Savings goal (FR02): the child's own goal, read by the child and their parents.
import { cache } from "react";
import { assertRole, assertSelfOrParentOf } from "@/features/family/server";
import { createClient } from "@/lib/supabase/server";
import { callArchiveGoal, callMarkCelebrated, callSaveGoal } from "./repository";

/** The child's active goal with progress, or null. Readable by the child and their parents. */
export const getGoalView = cache(async (childId: string): Promise<GoalView> => {
  await assertSelfOrParentOf(childId);
  return loadGoalView(await createClient(), childId);
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
