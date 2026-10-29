import "server-only";
import { clientEnv, routes } from "@/config";
import { sendEmail } from "@/features/notifications/server";
import { AppError, isAppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  generateCode,
  generateToken,
  hashSecret,
  normaliseEmailForLimit,
  normaliseFamilyCode,
} from "../codes";
import type {
  AcceptInvitationInput,
  ChildSignInInput,
  CreateFamilyInput,
  SetChildPinInput,
  StartChildOnboardingInput,
} from "../schemas";
import type { ChildSummary, Family } from "../types";
import {
  createChildAuthUser,
  deleteChildAuthUser,
  mintChildSession,
  rotateChildPassword,
} from "./child-auth";
import { assertParentOf, assertRole, getMembership } from "./dal";
import {
  findFamilyById,
  findInvitationByHash,
  findNickname,
  hitRateLimit,
  insertFamily,
  insertInvitation,
  listChildMembers,
  registerChild,
  revokeUserSessions,
  updateChildPin,
  verifyChildPin,
} from "./repository";

/** Business logic for families, children and invitations. Auth checks happen here, via the DAL. */

const INVITE_CODE_LENGTH = 8;

/** Shown for unknown, expired and used invitations alike, so none can be told apart. */
export const INVITATION_GONE =
  "This invitation has expired or was already used. Ask your child to start again.";

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
  const id = await insertFamily(db, input.currency, input.timezone).catch((error: unknown) => {
    // create_family raises 22023 (VALIDATION) only for a timezone Postgres doesn't know. The
    // timezone comes from the device, so the parent can't fix it: use UTC instead of a dead end.
    if (!isAppError(error) || error.code !== "VALIDATION") throw error;
    logger.warn("Device timezone rejected, using UTC", { timezone: input.timezone });
    return insertFamily(db, input.currency, "UTC");
  });
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

/** The signed-in child's nickname, for the greeting. Children only. */
export async function getChildNickname(): Promise<string> {
  const { user } = await assertRole("child");
  return (await findNickname(await createClient(), user.id)) ?? "";
}

/**
 * Creates the child's auth user, then registers it through the parent's own client so the
 * database authorises the parent. If registration fails the auth user is deleted again.
 */
export async function addChild(input: {
  familyId: string;
  nickname: string;
  pin: string;
  consent: boolean;
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
  // Limiter keys hold hashes only: usage_counters never stores an IP or an email address.
  const [ipHash, emailHash] = await Promise.all([
    hashSecret(ip),
    hashSecret(normaliseEmailForLimit(input.parentEmail)),
  ]);
  await enforceLimits(
    [
      { key: `invite:ip:${ipHash}`, window: "1 hour", max: 5 },
      { key: `invite:email:${emailHash}`, window: "1 day", max: 3 },
      { key: "invite:global", window: "1 day", max: 200 },
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
      // Fixed subject: the nickname is child-chosen text and stays out of the inbox preview.
      subject: "Your child wants to join Jarso",
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

/**
 * Resolves a pasted link token or short code to a pending invitation. Parent only, rate-limited.
 * find_invitation is service_role only, so the parent check here is what authorises the lookup.
 */
export async function findInvitation(
  invite: string,
): Promise<{ id: string; nickname: string } | null> {
  const { user } = await assertRole("parent");
  await enforceLimits(
    [{ key: `invite-lookup:user:${user.id}`, window: "1 hour", max: 10 }],
    "Too many tries. Please wait a little and try again.",
  );

  const admin = createAdminClient();
  const value = invite.trim();
  return (
    (await findInvitationByHash(admin, await hashSecret(value))) ??
    findInvitationByHash(admin, await hashSecret(normaliseFamilyCode(value)))
  );
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<ChildSummary> {
  const { membership } = await assertRole("parent");
  if (!membership) throw new AppError("FORBIDDEN", "Set up your family first.");

  const invitation = await findInvitation(input.invite);
  if (!invitation) {
    throw new AppError("NOT_FOUND", INVITATION_GONE);
  }

  try {
    return await addChild({
      familyId: membership.familyId,
      nickname: input.nickname ?? invitation.nickname,
      pin: input.pin,
      consent: input.consent,
      invitationId: invitation.id,
    });
  } catch (error) {
    // A concurrent accept (e.g. a double tap) used the invitation between lookup and insert.
    if (isAppError(error) && error.code === "NOT_FOUND") {
      throw new AppError("NOT_FOUND", INVITATION_GONE, { cause: error });
    }
    throw error;
  }
}

/** Child PIN sign-in (ADR 0004). Must run where cookies are writable. */
export async function childSignIn(input: ChildSignInInput, ip: string): Promise<void> {
  const familyCode = normaliseFamilyCode(input.familyCode);
  // The family limit is per source too, so guessing from one network can't lock a family out.
  const ipHash = await hashSecret(ip);
  await enforceLimits(
    [
      { key: `pin:ip:${ipHash}`, window: "15 minutes", max: 20 },
      { key: `pin:family:${familyCode}:${ipHash}`, window: "1 hour", max: 30 },
    ],
    "Too many tries. Ask your parent or wait a little while.",
  );

  const result = await verifyChildPin(
    createAdminClient(),
    familyCode,
    input.nickname,
    input.pin,
    ipHash,
  );
  if (result.status === "locked") {
    throw new AppError("RATE_LIMITED", "Too many tries. Ask your parent or wait a little while.");
  }
  if (result.status !== "ok") {
    throw new AppError("UNAUTHORIZED", "Hmm, that didn't match. Check with your parent.");
  }

  // Kills any password the child set for themselves (which would skip the PIN and lockout).
  // Before minting: GoTrue may end the user's existing sessions on a password change.
  await rotateChildPassword(result.childId);
  await mintChildSession(result.childId);
}

/** Parent resets a PIN. The old PIN, any self-set password and every signed-in device stop working. */
export async function setChildPin(input: SetChildPinInput): Promise<void> {
  await assertParentOf(input.childId);
  await updateChildPin(await createClient(), input.childId, input.pin);
  await rotateChildPassword(input.childId);
  await revokeUserSessions(createAdminClient(), input.childId);
}
