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

  if (error) throw new AppError("UNAUTHORIZED", "Invalid email or password", { cause: error });

  redirect(safeNextPath(next));
});

export const signUp = createAction(signUpSchema, async ({ email, password, fullName }) => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: new URL(routes.authCallback, clientEnv.NEXT_PUBLIC_APP_URL).toString(),
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

  redirect(routes.dashboard);
});

export const signOut = createAction(z.object({}), async () => {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(routes.login);
});
