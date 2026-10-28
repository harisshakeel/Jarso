import "server-only";
import { clientEnv, routes } from "@/config";
import { sendEmail } from "@/features/notifications/server";
import { AppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateCode, generateToken, hashSecret, normaliseFamilyCode } from "../codes";
import type {
  AcceptInvitationInput,
  ChildSignInInput,
  CreateFamilyInput,
  SetChildPinInput,
  StartChildOnboardingInput,
} from "../schemas";
import type { ChildSummary, Family } from "../types";
import { createChildAuthUser, deleteChildAuthUser, mintChildSession } from "./child-auth";
import { assertParentOf, assertRole, getMembership } from "./dal";
import {
  findFamilyById,
  findInvitationByHash,
  hitRateLimit,
  insertFamily,
  insertInvitation,
  listChildMembers,
  registerChild,
  updateChildPin,
  verifyChildPin,
} from "./repository";

/** Business logic for families, children and invitations. Auth checks happen here, via the DAL. */

const INVITE_CODE_LENGTH = 8;

type Limit = { key: string; window: string; max: number };

/** Records a hit on every limit (so each window counts all attempts); throws if any denies. */
async function enforceLimits(limits: Limit[], message: string): Promise<void> {
  const admin = createAdminClient();
  const allowed = await Promise.all(limits.map((l) => hitRateLimit(admin, l.key, l.window, l.max)));
  if (allowed.includes(false)) throw new AppError("RATE_LIMITED", message);
}

export async function createFamily(input: CreateFamilyInput): Promise<Family> {
  await assertRole("parent");
  const db = await createClient();
  const id = await insertFamily(db, input.currency, input.timezone);
  const family = await findFamilyById(db, id);
  if (!family) throw new AppError("INTERNAL", "Failed to load the new family");
  return family;
}

export async function getFamily(): Promise<Family | null> {
  const membership = await getMembership();
  if (!membership) return null;
  return findFamilyById(await createClient(), membership.familyId);
}

export async function listChildren(): Promise<ChildSummary[]> {
  const membership = await getMembership();
  if (!membership) return [];
  return listChildMembers(await createClient(), membership.familyId);
}

/**
 * Creates the child's auth user, then registers it through the parent's own client so the
 * database authorises the parent. If registration fails the auth user is deleted again.
 */
export async function addChild(input: {
  familyId: string;
  nickname: string;
  pin: string;
  invitationId?: string;
}): Promise<ChildSummary> {
  const { membership } = await assertRole("parent");
  // Fail fast before creating an auth user; register_child re-checks authoritatively.
  if (membership?.familyId !== input.familyId)
    throw new AppError("FORBIDDEN", "You can't do that.");
  const db = await createClient();
  const childId = await createChildAuthUser();
  try {
    await registerChild(db, { childId, ...input });
  } catch (error) {
    await deleteChildAuthUser(childId);
    throw error;
  }
  return { id: childId, nickname: input.nickname.trim() };
}

/** Child-started onboarding (signed out). Always returns a link and code; email is a bonus. */
export async function startChildOnboarding(
  input: StartChildOnboardingInput,
  ip: string,
): Promise<{ link: string; code: string }> {
  await enforceLimits(
    [
      { key: `invite:ip:${ip}`, window: "1 hour", max: 5 },
      { key: `invite:email:${input.parentEmail.toLowerCase()}`, window: "1 day", max: 3 },
    ],
    "Too many tries. Please wait a little and try again.",
  );

  const token = generateToken();
  const code = generateCode(INVITE_CODE_LENGTH);
  await insertInvitation(createAdminClient(), {
    nickname: input.nickname,
    parentEmail: input.parentEmail,
    tokenHash: await hashSecret(token),
    codeHash: await hashSecret(code),
  });

  const link = `${clientEnv.NEXT_PUBLIC_APP_URL}${routes.invite}?token=${token}`;
  try {
    await sendEmail({
      to: input.parentEmail,
      subject: `${input.nickname} wants to join Jarso`,
      text: [
        `${input.nickname} asked to join your family on Jarso, a pocket-money learning app.`,
        `To approve, sign in or create a parent account, then open this link: ${link}`,
        `Or enter the code ${code}. It expires in 7 days.`,
        "If you don't know who this is, you can ignore this email.",
      ].join("\n\n"),
    });
  } catch (error) {
    logger.warn("Invitation email failed", { cause: error });
  }

  return { link, code };
}

/** Resolves a pasted link token or short code to a pending invitation. Parent only, rate-limited. */
export async function findInvitation(
  invite: string,
): Promise<{ id: string; nickname: string } | null> {
  const { user } = await assertRole("parent");
  await enforceLimits(
    [{ key: `invite-lookup:user:${user.id}`, window: "1 hour", max: 10 }],
    "Too many tries. Please wait a little and try again.",
  );

  const db = await createClient();
  const value = invite.trim();
  return (
    (await findInvitationByHash(db, await hashSecret(value))) ??
    findInvitationByHash(db, await hashSecret(normaliseFamilyCode(value)))
  );
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<ChildSummary> {
  const { membership } = await assertRole("parent");
  if (!membership) throw new AppError("FORBIDDEN", "Set up your family first.");

  const invitation = await findInvitation(input.invite);
  if (!invitation) {
    throw new AppError("NOT_FOUND", "That invite has expired or was already used.");
  }

  return addChild({
    familyId: membership.familyId,
    nickname: input.nickname ?? invitation.nickname,
    pin: input.pin,
    invitationId: invitation.id,
  });
}

/** Child PIN sign-in (ADR 0004). Must run where cookies are writable. */
export async function childSignIn(input: ChildSignInInput, ip: string): Promise<void> {
  const familyCode = normaliseFamilyCode(input.familyCode);
  await enforceLimits(
    [
      { key: `pin:ip:${ip}`, window: "15 minutes", max: 20 },
      { key: `pin:family:${familyCode}`, window: "1 hour", max: 30 },
    ],
    "Too many tries. Ask your parent or wait a little while.",
  );

  const result = await verifyChildPin(createAdminClient(), familyCode, input.nickname, input.pin);
  if (result.status === "locked") {
    throw new AppError("RATE_LIMITED", "Too many tries. Ask your parent or wait a little while.");
  }
  if (result.status !== "ok") {
    throw new AppError("UNAUTHORIZED", "Hmm, that didn't match. Check with your parent.");
  }

  await mintChildSession(result.childId);
}

export async function setChildPin(input: SetChildPinInput): Promise<void> {
  await assertParentOf(input.childId);
  await updateChildPin(await createClient(), input.childId, input.pin);
}
