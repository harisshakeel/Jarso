"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clientEnv, routes } from "@/config";
import { AppError, createAction, logger } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath, signInSchema, signUpSchema } from "../schemas";

export const signIn = createAction(signInSchema, async ({ email, password, next }) => {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // One message for every failure (no account enumeration); the code goes to the server log.
    logger.warn("Sign-in rejected", { code: error.code, status: error.status });
    throw new AppError("UNAUTHORIZED", "Invalid email or password", { cause: error });
  }

  redirect(safeNextPath(next));
});

export const signUp = createAction(signUpSchema, async ({ email, password, fullName, next }) => {
  const target = safeNextPath(next);
  const callback = new URL(routes.authCallback, clientEnv.NEXT_PUBLIC_APP_URL);
  // Carries e.g. /invite?token=… through email confirmation. The confirmation email links to
  // /auth/confirm with this URL as `next` (unwrapped there); /auth/callback reads it directly.
  callback.searchParams.set("next", target);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: callback.toString(),
    },
  });

  if (error) {
    // Raw Supabase messages reveal whether an email is registered; log them, show a generic one.
    logger.warn("Sign-up rejected", { code: error.code, status: error.status });
    throw new AppError(
      "VALIDATION",
      "We couldn't create your account. Check your details and try again.",
      { cause: error },
    );
  }

  // Email confirmation enabled → no session yet.
  if (!data.session) return { needsConfirmation: true };

  redirect(target);
});

export const signOut = createAction(z.object({}), async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(routes.login);
});
