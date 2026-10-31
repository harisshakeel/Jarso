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

export const markCelebratedAction = createAction(goalIdSchema, async ({ goalId }) => {
  await markCelebrated(goalId);
  revalidatePath(routes.child);
});
