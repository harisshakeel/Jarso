import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/lib";
import type { Database, TablesUpdate } from "@/types";
import type { Profile, ProfileRow } from "../types";

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
