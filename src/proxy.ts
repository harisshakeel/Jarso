import type { NextRequest } from "next/server";
import { authRoutePrefixes, protectedRoutePrefixes, routes } from "@/config";
import { redirectWithSession, updateSession } from "@/lib/supabase/proxy";

const matches = (pathname: string, prefixes: readonly string[]) =>
  prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/**
 * Refreshes the auth session on every request and performs OPTIMISTIC redirects.
 * Real authorization lives in the DAL (src/features/auth/server/session.ts) and RLS.
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!claims && matches(pathname, protectedRoutePrefixes)) {
    return redirectWithSession(request, response, routes.login, { next: pathname });
  }

  if (claims && matches(pathname, authRoutePrefixes)) {
    return redirectWithSession(request, response, routes.dashboard);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip static assets and image optimisation; run on everything else.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
