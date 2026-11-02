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
    // The error may come after GoTrue inserted the user (e.g. a timeout), which would leave an
    // orphan under the id we chose. Delete it best-effort; "not found" means nothing was created.
    await deleteOrphan(id);
    throw new AppError("INTERNAL", "We couldn't create the child account. Please try again.", {
      cause: error,
    });
  }
  return id;
}

async function deleteOrphan(id: string): Promise<void> {
  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(id);
    if (error && error.status !== 404) {
      logger.warn("Orphan child auth user cleanup failed", { childId: id, code: error.code });
    }
  } catch (cause) {
    logger.warn("Orphan child auth user cleanup failed", { childId: id, cause });
  }
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

/**
 * Replaces the child's password with a fresh random one nobody knows. A child session could set
 * its own password and then sign in without the PIN; rotating on PIN reset ends that. Not done on
 * PIN sign-in: GoTrue may end the user's other sessions here, which would sign out other devices.
 */
export async function rotateChildPassword(childId: string): Promise<void> {
  const { error } = await createAdminClient().auth.admin.updateUserById(childId, {
    password: generateToken(),
  });
  if (error) {
    logger.error("Child password rotation failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    throw new AppError("INTERNAL", "Something went wrong. Please try again.", { cause: error });
  }
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
