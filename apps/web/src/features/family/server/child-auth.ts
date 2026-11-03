import "server-only";
import { childEmail, generateToken } from "@jarso/core/family";
import { AppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createStatelessClient } from "@/lib/supabase/stateless";

/**
 * Child auth users (ADR 0004). A child is a real auth user with a synthetic, non-deliverable
 * email and a random password nobody knows. Sessions are minted server-side after the PIN
 * check: admin generateLink → verifyOtp on the user's cookie client. Verified against local
 * GoTrue: the `.invalid` domain is accepted and `type: "magiclink"` verifies. Any later
 * password change (even one a child session makes for itself) is replaced with an unknowable
 * hash by the `scramble_child_password` trigger on auth.users, so password sign-in never
 * skips the PIN.
 */

const signInFailed = "We couldn't sign you in. Please try again.";

/** Creates the auth user (the profile row follows via trigger) and returns its id. */
export async function createChildAuthUser(): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await createAdminClient().auth.admin.createUser({
    id,
    email: childEmail(id),
    password: generateToken(),
    email_confirm: true,
    app_metadata: { jarso_role: "child" },
  });
  if (error) {
    logger.error("Child auth user creation failed", { code: error.code, status: error.status });
    throw new AppError("INTERNAL", "We couldn't create the child account. Please try again.", {
      cause: error,
    });
  }
  return id;
}

/** Best-effort cleanup used when registration fails after the auth user was created. */
export async function deleteChildAuthUser(id: string): Promise<void> {
  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) logger.error("Failed to delete orphan child auth user", { childId: id, cause: error });
}

/**
 * Deletes a removed child's identity (ADR 0007). Throws so the parent sees the failure and can
 * run the removal again: `remove_child` is idempotent for an already-removed child.
 */
export async function deleteChildIdentity(id: string): Promise<void> {
  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) {
    logger.error("Removed child identity deletion failed", {
      childId: id,
      code: error.code,
      status: error.status,
    });
    throw new AppError("INTERNAL", "We couldn't finish removing the child. Please try again.", {
      cause: error,
    });
  }
}

export type SessionTokens = { accessToken: string; refreshToken: string; expiresAt: number };

/** Admin-generated magiclink hash for the child, to be exchanged by verifyOtp. */
async function generateChildTokenHash(childId: string): Promise<string> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email: childEmail(childId),
  });
  if (error) {
    logger.error("Child sign-in link failed", { code: error.code, status: error.status });
    throw new AppError("INTERNAL", signInFailed, { cause: error });
  }
  return data.properties.hashed_token;
}

/** Signs the current request in as the child. Needs writable cookies (Server Action / Route Handler). */
export async function mintChildSession(childId: string): Promise<void> {
  const tokenHash = await generateChildTokenHash(childId);
  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError) throw new AppError("INTERNAL", signInFailed, { cause: verifyError });
}

/**
 * Mints a session for a non-cookie client (the mobile app) and returns its tokens. Uses a
 * stateless client so nothing is persisted and no cookie is touched.
 */
export async function mintChildSessionTokens(childId: string): Promise<SessionTokens> {
  const tokenHash = await generateChildTokenHash(childId);
  const supabase = createStatelessClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (error || !data.session) {
    logger.error("Child session verification failed", {
      code: error?.code,
      status: error?.status,
    });
    throw new AppError("INTERNAL", signInFailed, { cause: error ?? undefined });
  }
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + data.session.expires_in,
  };
}
