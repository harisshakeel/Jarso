import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { routes } from "@/config";
import type { SessionUser } from "@/features/auth";
import { assertUser, getCurrentUser, requireUser } from "@/features/auth/server";
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

/** For actions / route handlers: throws UNAUTHORIZED when signed out, FORBIDDEN on wrong role. */
export async function assertRole(role: Role): Promise<RoleContext> {
  const user = await assertUser();
  if ((await getRole(user.id)) !== role) throw new AppError("FORBIDDEN", "You can't do that.");
  return { user, membership: await getMembership() };
}

/** Throws FORBIDDEN unless the signed-in user is an approved parent of this child. */
export async function assertParentOf(childId: string): Promise<SessionUser> {
  const { user } = await assertRole("parent");
  if (!(await isParentOf(await createClient(), childId))) {
    throw new AppError("FORBIDDEN", "You can't do that.");
  }
  return user;
}

/** For reads of a child's money: the child themselves, or an approved parent of the child. */
export async function assertSelfOrParentOf(childId: string): Promise<SessionUser> {
  const user = await assertUser();
  if (user.id === childId) return user;
  return assertParentOf(childId);
}
