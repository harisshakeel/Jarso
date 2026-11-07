import { authPaths, type SignUpInput } from "@jarso/core/auth";
import { offlineCopy } from "@jarso/core/offline";
import { setupFlowCopy } from "@jarso/core/setup";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { env } from "@/config";
import { AppError, logger } from "@/lib";
import { supabase } from "@/lib/supabase/client";

/** `signed-in`: Supabase returned a session (confirmations off). `verify`: a code was emailed. */
export type SignUpOutcome = "signed-in" | "verify";

/** What an auth call's error says, for the log only: never the address, password or code. */
function describe(error: unknown) {
  const { code, status } = error as { code?: string; status?: number };
  return { code, status };
}

/** Calls supabase-js; a thrown network failure is returned as the error like any other. */
async function call<T extends { error: unknown }>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return { error } as T;
  }
}

function offline(error: unknown): AppError {
  return new AppError("UNAVAILABLE", offlineCopy.offline, { cause: error });
}

/**
 * Where the email's link goes when it is tapped instead of the code is typed: the web's
 * confirmation route, which signs that browser in (the phone then signs in with the password).
 */
const emailRedirectTo = `${env.apiUrl.replace(/\/$/, "")}${authPaths.authCallback}?next=${encodeURIComponent(authPaths.dashboard)}`;

/**
 * Creates the parent's account. With confirmations off Supabase returns a session at once and
 * supabase-js keeps it; with them on it returns none and emails a code. Every refusal reads the
 * same (no account enumeration); an address already registered with confirmations on gets
 * `verify` and no email, as Supabase obfuscates it.
 */
export async function signUpParent(
  input: Pick<SignUpInput, "email" | "password" | "fullName">,
): Promise<SignUpOutcome> {
  const { data, error } = await call(() =>
    supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.fullName }, emailRedirectTo },
    }),
  );
  if (!error) return data.session ? "signed-in" : "verify";
  if (isAuthRetryableFetchError(error)) throw offline(error);
  logger.warn("Sign-up rejected", describe(error));
  throw new AppError("VALIDATION", setupFlowCopy.account.refused, { cause: error });
}

/** Turns the emailed code into a session (supabase-js keeps it; the session provider reads the role). */
export async function verifyEmailCode(email: string, code: string): Promise<void> {
  const { error } = await call(() =>
    supabase.auth.verifyOtp({ email, token: code, type: "email" }),
  );
  if (!error) return;
  if (isAuthRetryableFetchError(error)) throw offline(error);
  logger.warn("Email code rejected", describe(error));
  throw new AppError("VALIDATION", setupFlowCopy.verify.noMatch, { cause: error });
}

/** Sends the sign-up code again. Supabase allows one a minute (`max_frequency`). */
export async function resendEmailCode(email: string): Promise<void> {
  const { error } = await call(() => supabase.auth.resend({ type: "signup", email }));
  if (!error) return;
  if (isAuthRetryableFetchError(error)) throw offline(error);
  const { code, status } = describe(error);
  logger.warn("Email code resend refused", { code, status });
  if (status === 429 || code === "over_email_send_rate_limit") {
    throw new AppError("RATE_LIMITED", setupFlowCopy.verify.slowDown, { cause: error });
  }
  throw new AppError("VALIDATION", setupFlowCopy.account.refused, { cause: error });
}
