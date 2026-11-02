"use server";

import { refresh } from "next/cache";
import { assertUser } from "@/features/auth/server";
import { createAction } from "@/lib";
import { parentDetailsSchema, updateProfileSchema } from "../schemas";
import { completeParentProfile, updateProfile } from "./service";

export const updateProfileAction = createAction(updateProfileSchema, async (input) => {
  const user = await assertUser();
  const profile = await updateProfile(user.id, input);
  refresh();
  return profile;
});

/** Saves the parent's details; refresh() re-renders the shell so the completion dialog closes. */
export const completeParentProfileAction = createAction(parentDetailsSchema, async (input) => {
  await assertUser();
  await completeParentProfile(input);
  refresh();
});
