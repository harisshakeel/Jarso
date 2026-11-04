import type {
  ChildSummary,
  CreateFamilyInput,
  Family,
  Membership,
  PendingInvitation,
} from "@jarso/core/family";
import { AppError, isAppError, logger, toAppError } from "@jarso/core/lib";
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

export async function insertFamily(
  db: Client,
  currency: string,
  timezone: string,
): Promise<string> {
  const { data, error } = await db.rpc("create_family", {
    p_currency: currency,
    p_timezone: timezone,
  });
  if (error) throw toAppError(error, "Failed to create family");
  return data;
}

/**
 * Creates the caller's family and returns it. create_family raises 22023 (VALIDATION) only for a
 * timezone Postgres doesn't know. The timezone comes from the device, so the parent can't fix
 * it: use UTC instead of a dead end.
 */
export async function createFamilyWithFallback(
  db: Client,
  input: CreateFamilyInput,
): Promise<Family> {
  const id = await insertFamily(db, input.currency, input.timezone).catch((error: unknown) => {
    if (!isAppError(error) || error.code !== "VALIDATION") throw error;
    logger.warn("Device timezone rejected, using UTC", { timezone: input.timezone });
    return insertFamily(db, input.currency, "UTC");
  });
  const family = await findFamilyById(db, id);
  if (!family) throw new AppError("INTERNAL", "Failed to load the new family");
  return family;
}

export async function listChildMembers(db: Client, familyId: string): Promise<ChildSummary[]> {
  const { data, error } = await db
    .from("family_members")
    .select("profile_id, created_at, profile:profiles!family_members_profile_id_fkey(nickname)")
    .eq("family_id", familyId)
    .eq("role", "child")
    .eq("status", "approved")
    .order("created_at", { ascending: true });
  if (error) throw toAppError(error, "Failed to load children");
  return data.map((row) => ({ id: row.profile_id, nickname: row.profile?.nickname ?? "" }));
}

export async function renameChildMember(
  db: Client,
  childId: string,
  nickname: string,
): Promise<void> {
  const { error } = await db.rpc("rename_child", { p_child_id: childId, p_nickname: nickname });
  if (error) throw toAppError(error, "Failed to rename the child");
}

export async function updateFamilyTimezone(db: Client, timezone: string): Promise<void> {
  const { error } = await db.rpc("update_family_timezone", { p_timezone: timezone });
  if (error) throw toAppError(error, "Failed to update the family settings");
}

/** Pending invitations to the caller's own confirmed email (parents only; the function checks). */
export async function listInvitationsForCaller(db: Client): Promise<PendingInvitation[]> {
  const { data, error } = await db.rpc("list_my_invitations");
  if (error) throw toAppError(error, "Failed to load invitations");
  return data.map((row) => ({
    id: row.id,
    nickname: row.nickname,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}
