import type { SignInInput } from "@jarso/core/auth";
import { offlineCopy } from "@jarso/core/offline";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { AppError, logger } from "@/lib";
import { supabase } from "@/lib/supabase/client";

/** The web's line for every password sign-in failure (no account enumeration). */
export const INVALID_CREDENTIALS = "Invalid email or password";

/**
 * Email and password sign-in, straight to Supabase Auth. supabase-js stores and refreshes the
 * session; the session provider then reads the role.
 */
export async function signInParent(input: SignInInput): Promise<void> {
  const { email, password } = input;
  let error: unknown;
  try {
    ({ error } = await supabase.auth.signInWithPassword({ email, password }));
  } catch (thrown) {
    error = thrown;
  }
  if (!error) return;
  if (isAuthRetryableFetchError(error)) {
    throw new AppError("UNAVAILABLE", offlineCopy.offline, { cause: error });
  }
  const { code, status } = error as { code?: string; status?: number };
  logger.warn("Sign-in rejected", { code, status });
  throw new AppError("UNAUTHORIZED", INVALID_CREDENTIALS, { cause: error });
}
