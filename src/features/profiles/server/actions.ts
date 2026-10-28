"use server";

import { refresh } from "next/cache";
import { assertUser } from "@/features/auth/server";
import { createAction } from "@/lib";
import { updateProfileSchema } from "../schemas";
import { updateProfile } from "./service";

export const updateProfileAction = createAction(updateProfileSchema, async (input) => {
  const user = await assertUser();
  const profile = await updateProfile(user.id, input);
  refresh();
  return profile;
});
