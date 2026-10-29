import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { genderOptions, isCountryCode } from "@/config";
import { AppError, logger, toAppError } from "@/lib";
import type { Database, TablesUpdate } from "@/types";
import type { ParentDetailsInput } from "../schemas";
import type { ParentDetails, Profile, ProfileRow } from "../types";

type Client = SupabaseClient<Database>;

/** Only place that knows profile table/column names. Pure data access — no auth decisions. */

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  fullName: row.full_name,
  avatarUrl: row.avatar_url,
  createdAt: row.created_at,
});

export async function findProfileById(db: Client, id: string): Promise<Profile | null> {
  const { data, error } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw new AppError("INTERNAL", "Failed to load profile", { cause: error });
  return data ? toProfile(data) : null;
}

export async function updateProfileById(
  db: Client,
  id: string,
  patch: TablesUpdate<"profiles">,
): Promise<Profile> {
  const { data, error } = await db.from("profiles").update(patch).eq("id", id).select("*").single();
  if (error) throw new AppError("INTERNAL", "Failed to update profile", { cause: error });
  return toProfile(data);
}

const isGender = (value: string): value is ParentDetails["gender"] =>
  (genderOptions as readonly string[]).includes(value);

/** The signed-in parent's own details, or null before completion. RLS: owner only. */
export async function findParentDetails(db: Client, userId: string): Promise<ParentDetails | null> {
  const { data, error } = await db
    .from("parent_details")
    .select("date_of_birth, country, gender, completed_at")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load your details");
  if (!data) return null;
  if (!isCountryCode(data.country) || !isGender(data.gender)) {
    // Only reachable by calling complete_parent_profile directly with an unlisted value; the
    // parent is asked again and a resubmit through the form heals it.
    logger.warn("Parent details hold an unlisted value; treating the profile as incomplete", {
      userId,
    });
    return null;
  }
  return {
    dateOfBirth: data.date_of_birth,
    country: data.country,
    gender: data.gender,
    completedAt: data.completed_at,
  };
}

/** Records or updates the caller's details (complete_parent_profile). */
export async function upsertParentDetails(db: Client, input: ParentDetailsInput): Promise<void> {
  const { error } = await db.rpc("complete_parent_profile", {
    p_date_of_birth: input.dateOfBirth,
    p_country: input.country,
    p_gender: input.gender,
  });
  if (error) throw toAppError(error, "Failed to save your details");
}
