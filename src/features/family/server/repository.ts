import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import type { ChildSummary, Family, Membership, PendingInvitation } from "../types";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows family table, column and function names. Pure data access, no auth
 * decisions. `db` is the user's server client unless the parameter is named `admin`; the admin
 * client is used only for the service_role functions (rate limits, invitations, PIN check,
 * session revocation), after the service's own authz.
 */

export type PinCheck = { status: "ok"; childId: string } | { status: "invalid" | "locked" };

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

export async function isParentOf(db: Client, childId: string): Promise<boolean> {
  const { data, error } = await db.rpc("is_parent_of", { p_child_id: childId });
  if (error) throw toAppError(error, "Failed to check access");
  return data === true;
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

export async function findFamilyById(db: Client, id: string): Promise<Family | null> {
  const { data, error } = await db
    .from("families")
    .select("id, code, currency, timezone")
    .eq("id", id)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load family");
  return data;
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

export async function registerChild(
  db: Client,
  args: {
    childId: string;
    familyId: string;
    nickname: string;
    pin: string;
    consent: boolean;
    invitationId?: string;
  },
): Promise<void> {
  const { error } = await db.rpc("register_child", {
    p_child_id: args.childId,
    p_family_id: args.familyId,
    p_nickname: args.nickname,
    p_pin: args.pin,
    p_consent: args.consent,
    ...(args.invitationId && { p_invitation_id: args.invitationId }),
  });
  if (error) throw toAppError(error, "Failed to add child");
}

export async function updateChildPin(db: Client, childId: string, pin: string): Promise<void> {
  const { error } = await db.rpc("set_child_pin", { p_child_id: childId, p_pin: pin });
  if (error) throw toAppError(error, "Failed to update PIN");
}

/** Parent removes a child (remove_child). True when the auth identity may be deleted. */
export async function removeChildMember(db: Client, childId: string): Promise<boolean> {
  const { data, error } = await db.rpc("remove_child", { p_child_id: childId });
  if (error) throw toAppError(error, "Failed to remove the child");
  return data === true;
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

export async function findInvitationByHash(
  admin: Client,
  hash: string,
): Promise<{ id: string; nickname: string } | null> {
  const { data, error } = await admin.rpc("find_invitation", { p_hash: hash });
  if (error) throw toAppError(error, "Failed to look up invite");
  const row = data?.[0];
  return row ? { id: row.id, nickname: row.nickname } : null;
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

/** `window` is a Postgres interval string, e.g. "1 hour". Returns true when the hit is allowed. */
export async function hitRateLimit(
  admin: Client,
  key: string,
  window: string,
  max: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("hit_rate_limit", {
    p_key: key,
    p_window: window,
    p_max: max,
  });
  if (error) throw toAppError(error, "Failed to check rate limit");
  return data === true;
}

export async function insertInvitation(
  admin: Client,
  args: { nickname: string; parentEmail: string; tokenHash: string; codeHash: string },
): Promise<string> {
  const { data, error } = await admin.rpc("create_invitation", {
    p_nickname: args.nickname,
    p_parent_email: args.parentEmail,
    p_token_hash: args.tokenHash,
    p_code_hash: args.codeHash,
  });
  if (error) throw toAppError(error, "Failed to create invite");
  return data;
}

/** `sourceHash` (hashed client IP) scopes the lockout: a lock from one source never blocks another. */
export async function verifyChildPin(
  admin: Client,
  familyCode: string,
  nickname: string,
  pin: string,
  sourceHash: string,
): Promise<PinCheck> {
  const { data, error } = await admin.rpc("verify_child_pin", {
    p_family_code: familyCode,
    p_nickname: nickname,
    p_pin: pin,
    p_source_hash: sourceHash,
  });
  if (error) throw toAppError(error, "Failed to check PIN");
  const row = data?.[0];
  if (row?.status === "ok" && row.child_id) return { status: "ok", childId: row.child_id };
  if (row?.status === "locked") return { status: "locked" };
  if (row?.status === "invalid") return { status: "invalid" };
  throw new AppError("INTERNAL", "Failed to check PIN", { cause: { status: row?.status } });
}

/** Deletes every auth session (and refresh token) of the user. */
export async function revokeUserSessions(admin: Client, userId: string): Promise<void> {
  const { error } = await admin.rpc("revoke_user_sessions", { p_user_id: userId });
  if (error) throw toAppError(error, "Failed to sign out the child's devices");
}
