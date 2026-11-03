import "server-only";
import type { SessionUser } from "@jarso/core/auth";
import { verifyBearer } from "@/lib/supabase/request-scope";
import { assertUser } from "./session";

/**
 * For `/api/v1` route handlers: the signed-in user from `Authorization: Bearer <access token>`
 * (mobile), or from the cookie session when no header is sent (web). A header that is present
 * but unusable is always UNAUTHORIZED: it never falls back to cookies. The token is never logged.
 */
export async function assertRequestUser(request: Request): Promise<SessionUser> {
  const header = request.headers.get("authorization");
  if (header === null) return assertUser();

  const { id, email } = await verifyBearer(header);
  return { id, email };
}
