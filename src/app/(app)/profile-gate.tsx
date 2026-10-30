import { unstable_rethrow } from "next/navigation";
import { getCurrentUser } from "@/features/auth/server";
import { currentRole } from "@/features/family/server";
import { ProfileCompletionDialog } from "@/features/profiles";
import { isParentProfileComplete } from "@/features/profiles/server";
import { logger } from "@/lib";

/**
 * Puts the profile-completion dialog over every page of a parent whose profile is incomplete
 * (ADR 0008). Reads the session, so it must render inside <Suspense>. Children and complete
 * parents get nothing.
 *
 * Fails open: if the lookup itself fails (a database hiccup, or code deployed before its
 * migration), the page renders without the dialog instead of the whole shell turning into the
 * error page. That is safe because the server still refuses parent actions in assertRole,
 * which fails closed.
 */
export async function ProfileGate() {
  try {
    const user = await getCurrentUser();
    if (!user || (await currentRole()) !== "parent") return null;
    if (await isParentProfileComplete(user.id)) return null;
  } catch (error) {
    // Next's own control flow (prerender bail-out, redirect, not found) is not a failure.
    unstable_rethrow(error);
    logger.warn("Profile gate check failed; showing the page without the dialog", { error });
    return null;
  }
  return <ProfileCompletionDialog />;
}
