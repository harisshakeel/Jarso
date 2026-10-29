import "server-only";
import { AppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { childEmail, generateToken } from "../codes";

/**
 * Child auth users (ADR 0004). A child is a real auth user with a synthetic, non-deliverable
 * email and a random password nobody knows. Sessions are minted server-side after the PIN
 * check: admin generateLink → verifyOtp on the user's cookie client. Verified against local
 * GoTrue: the `.invalid` domain is accepted and `type: "magiclink"` verifies.
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
 * Replaces the child's password with a fresh random one nobody knows. A child session could set
 * its own password and then sign in without the PIN; rotating on every PIN sign-in and PIN reset
 * ends that. GoTrue may also end the user's other sessions here.
 */
export async function rotateChildPassword(childId: string): Promise<void> {
  const { error } = await createAdminClient().auth.admin.updateUserById(childId, {
    password: generateToken(),
  });
  if (error)
    throw new AppError("INTERNAL", "Something went wrong. Please try again.", { cause: error });
}

/** Signs the current request in as the child. Needs writable cookies (Server Action / Route Handler). */
export async function mintChildSession(childId: string): Promise<void> {
  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: "magiclink",
    email: childEmail(childId),
  });
  if (error) throw new AppError("INTERNAL", signInFailed, { cause: error });

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) throw new AppError("INTERNAL", signInFailed, { cause: verifyError });
}
