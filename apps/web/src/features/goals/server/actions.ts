"use server";

import { revalidatePath } from "next/cache";
import { routes } from "@/config";
import { getFamilyContext } from "@/features/allowance/server";
import { createAction } from "@/lib";
import { goalIdSchema, goalInputSchema } from "../schemas";
import { archiveGoal, markCelebrated, saveGoal } from "./service";

export const saveGoalAction = createAction(
  async () => goalInputSchema((await getFamilyContext()).currency),
  async (input) => {
    const id = await saveGoal(input);
    revalidatePath(routes.child);
    return id;
  },
);

export const archiveGoalAction = createAction(goalIdSchema, async ({ goalId }) => {
  await archiveGoal(goalId);
  revalidatePath(routes.child);
});

// No revalidate: refreshing Home would replace the goal-reached moment the child is looking at.
// The next visit reads celebrated_at fresh.
export const markCelebratedAction = createAction(goalIdSchema, async ({ goalId }) => {
  await markCelebrated(goalId);
});
