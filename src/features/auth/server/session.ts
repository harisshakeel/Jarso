import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { routes } from "@/config";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import type { SessionUser } from "../types";

/**
 * Data Access Layer entry point for auth. Verifies the JWT and returns the current user,
 * or null. Memoised per request. Reads cookies, so callers must sit behind <Suspense>.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) return null;

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
});

/** For pages: redirect to login when signed out. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return user;
}

/** For actions / route handlers: throw a typed 401 when signed out. */
export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHORIZED", "You must be signed in");
  return user;
}
