import type { Family, Membership } from "@jarso/core/family";
import { toAppError } from "@jarso/core/lib";
import type { Database } from "@jarso/db";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Client = SupabaseClient<Database>;

export async function findMembership(db: Client, userId: string): Promise<Membership | null> {
  const { data, error } = await db
    .from("family_members")
    .select("family_id, role")
    .eq("profile_id", userId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load membership");
  if (!data) return null;
  return {
    familyId: data.family_id,
    role: data.role === "child" ? "child" : "parent",
    status: "approved",
  };
}

export async function findProfileRole(db: Client, userId: string): Promise<"parent" | "child"> {
  const { data, error } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) throw toAppError(error, "Failed to load profile");
  return data?.role === "child" ? "child" : "parent";
}

export async function findNickname(db: Client, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from("profiles")
    .select("nickname")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load profile");
  return data?.nickname ?? null;
}

export async function findFamilyById(db: Client, id: string): Promise<Family | null> {
  const { data, error } = await db
    .from("families")
    .select("id, code, currency, timezone")
    .eq("id", id)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load family");
  return data;
}
