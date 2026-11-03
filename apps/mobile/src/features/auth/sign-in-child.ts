import type { ChildSignInInput } from "@jarso/core/family";
import { offlineCopy } from "@jarso/core/offline";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { AppError, GENERIC_FAILURE, logger } from "@/lib";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase/client";

type ChildSessionTokens = { accessToken: string; refreshToken: string; expiresAt: number };

/**
 * PIN sign-in through the web (it holds the admin key and the rate limits), then hands the
 * tokens to supabase-js, which stores and refreshes them from here on.
 */
export async function signInChild(input: ChildSignInInput): Promise<void> {
  const tokens = await apiFetch<ChildSessionTokens>("/api/v1/auth/child-sign-in", {
    method: "POST",
    body: input,
  });
  const { error } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (!error) return;
  if (isAuthRetryableFetchError(error)) {
    throw new AppError("UNAVAILABLE", offlineCopy.offline, { cause: error });
  }
  logger.warn("Could not keep the new session", { code: error.code, status: error.status });
  throw new AppError("INTERNAL", GENERIC_FAILURE, { cause: error });
}
