import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { routes } from "@/config";
import type { SessionUser } from "@/features/auth";
import { assertUser, getCurrentUser, requireUser } from "@/features/auth/server";
import { isParentProfileComplete } from "@/features/profiles/server";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import type { Membership } from "../types";
import { findMembership, findProfileRole, isParentOf } from "./repository";

type Role = "parent" | "child";
type RoleContext = { user: SessionUser; membership: Membership | null };

/** Current user's approved membership, or null (signed out, or a parent before setup). Per request. */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return findMembership(await createClient(), user.id);
});

/** Role from the membership, falling back to the server-set profile role (parent before setup). */
const getRole = cache(async (userId: string): Promise<Role> => {
  const membership = await getMembership();
  return membership?.role ?? findProfileRole(await createClient(), userId);
});

const homeOf = (role: Role) => (role === "parent" ? routes.parent : routes.child);

/** Signed out → that role's sign-in: children use their PIN page, parents the login (with next). */
async function requireSignedIn(role: Role, next: string): Promise<SessionUser> {
  if (role === "parent") return requireUser(next);
  return (await getCurrentUser()) ?? redirect(routes.childSignIn);
}

/**
 * For pages. Signed out → the role's sign-in; wrong role → that role's own home. A parent
 * without a family passes with `membership: null` so the page can send them to setup.
 */
export async function requireRole(role: Role, next: string): Promise<RoleContext> {
  const user = await requireSignedIn(role, next);
  const actual = await getRole(user.id);
  if (actual !== role) redirect(homeOf(actual));
  return { user, membership: await getMembership() };
}

const PROFILE_INCOMPLETE = "Finish your profile first.";

/**
 * For actions / route handlers: throws UNAUTHORIZED when signed out, FORBIDDEN on wrong role,
 * and FORBIDDEN for a parent who has not completed their profile (ADR 0008), so every parent
 * action is blocked until then, not only the ones the completion dialog covers.
 */
export async function assertRole(role: Role): Promise<RoleContext> {
  const context = await assertSignedInAs(role);
  if (role === "parent" && !(await isParentProfileComplete(context.user.id))) {
    throw new AppError("FORBIDDEN", PROFILE_INCOMPLETE);
  }
  return context;
}

/** Signed in with this role. No profile check: only reads may skip it (assertParentCanRead). */
async function assertSignedInAs(role: Role): Promise<RoleContext> {
  const user = await assertUser();
  if ((await getRole(user.id)) !== role) throw new AppError("FORBIDDEN", "You can't do that.");
  return { user, membership: await getMembership() };
}

/** The signed-in user's role, or null when signed out. For pages that serve both roles. */
export async function currentRole(): Promise<Role | null> {
  const user = await getCurrentUser();
  return user ? getRole(user.id) : null;
}

/**
 * Whether the signed-in user is an approved parent of this child. Per request and per child, so
 * pages that read several services for each child run the check once per child.
 */
const parentOfChild = cache(
  async (childId: string): Promise<boolean> => isParentOf(await createClient(), childId),
);

async function assertParentOfChild(childId: string): Promise<void> {
  if (!(await parentOfChild(childId))) {
    throw new AppError("FORBIDDEN", "You can't do that.");
  }
}

/**
 * For actions: throws FORBIDDEN unless the signed-in user is an approved parent of this child
 * with a completed profile (ADR 0008).
 */
export async function assertParentOf(childId: string): Promise<SessionUser> {
  const { user } = await assertRole("parent");
  await assertParentOfChild(childId);
  return user;
}

/**
 * For parent-only reads: an approved parent of this child, profile complete or not. Parent
 * pages render behind the completion dialog (ADR 0008), so their reads must not throw for a
 * parent who hasn't finished it; every action still goes through assertParentOf.
 */
export async function assertParentCanRead(childId: string): Promise<SessionUser> {
  const { user } = await assertSignedInAs("parent");
  await assertParentOfChild(childId);
  return user;
}

/** For reads of a child's money: the child themselves, or an approved parent of the child. */
export async function assertSelfOrParentOf(childId: string): Promise<SessionUser> {
  const user = await assertUser();
  if (user.id === childId) return user;
  return assertParentCanRead(childId);
}
