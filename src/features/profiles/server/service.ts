import "server-only";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import type { UpdateProfileInput } from "../schemas";
import type { Profile } from "../types";
import { findProfileById, updateProfileById } from "./repository";

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
