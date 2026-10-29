import "server-only";
import { cache } from "react";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import type { ParentDetailsInput, UpdateProfileInput } from "../schemas";
import type { ParentDetails, Profile } from "../types";
import {
  findParentDetails,
  findProfileById,
  updateProfileById,
  upsertParentDetails,
} from "./repository";

/** Business logic. Called by Server Components, Server Actions and Route Handlers alike. */

export async function getProfile(userId: string): Promise<Profile> {
  const db = await createClient();
  const profile = await findProfileById(db, userId);
  if (!profile) throw new AppError("NOT_FOUND", "Profile not found");
  return profile;
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
  const db = await createClient();
  return updateProfileById(db, userId, {
    full_name: input.fullName,
    ...(input.avatarUrl !== undefined && { avatar_url: input.avatarUrl }),
  });
}

/** The signed-in parent's own details, or null before they complete their profile. Per request. */
export const getParentDetails = cache(async (userId: string): Promise<ParentDetails | null> => {
  return findParentDetails(await createClient(), userId);
});

/** Whether this parent has completed their profile (ADR 0008). Shares getParentDetails' read. */
export async function isParentProfileComplete(userId: string): Promise<boolean> {
  return (await getParentDetails(userId)) !== null;
}

/**
 * Records or updates the signed-in parent's details. The caller (the action) has checked the
 * session; the database checks role and rules and writes only the caller's own row.
 */
export async function completeParentProfile(input: ParentDetailsInput): Promise<void> {
  await upsertParentDetails(await createClient(), input);
}
