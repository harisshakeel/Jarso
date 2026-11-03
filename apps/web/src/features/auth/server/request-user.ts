import "server-only";
import type { SessionUser } from "@jarso/core/auth";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { AppError } from "@/lib";
import { createStatelessClient } from "@/lib/supabase/stateless";
import { assertUser } from "./session";

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * For `/api/v1` route handlers: the signed-in user from `Authorization: Bearer <access token>`
 * (mobile), or from the cookie session when no header is sent (web). A header that is present
 * but unusable is always UNAUTHORIZED: it never falls back to cookies. The token is never logged.
 */
export async function assertRequestUser(request: Request): Promise<SessionUser> {
  const header = request.headers.get("authorization");
  if (header === null) return assertUser();

  const token = BEARER.exec(header.trim())?.[1];
  if (!token) throw new AppError("UNAUTHORIZED", "You must be signed in");

  // Stateless: nothing is persisted or refreshed; the JWT is verified on its own.
  const supabase = createStatelessClient();
  const { data, error } = await supabase.auth.getClaims(token);

  if (error && isAuthRetryableFetchError(error)) {
    throw new AppError("UNAVAILABLE", "Jarso is taking a while. Please try again.", {
      cause: error,
    });
  }
  if (error || !data?.claims) throw new AppError("UNAUTHORIZED", "You must be signed in");

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}
