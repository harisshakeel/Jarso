import { type NextRequest, NextResponse } from "next/server";
import { routes } from "@/config";
import { safeNextPath } from "@/features/auth";
import { logger } from "@/lib";
import { createClient } from "@/lib/supabase/server";

/** Exchanges the PKCE `code` from email confirmation / OAuth for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    logger.warn("Auth code exchange failed", { error });
  }

  return NextResponse.redirect(new URL(`${routes.login}?error=auth_callback`, origin));
}
