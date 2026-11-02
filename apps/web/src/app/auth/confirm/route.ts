import { type NextRequest, NextResponse } from "next/server";
import { clientEnv, routes } from "@/config";
import { emailConfirmSchema, nextFromEmailLink } from "@/features/auth";
import { logger } from "@/lib";
import { createClient } from "@/lib/supabase/server";

/**
 * Email confirmation link target. Verifies the token hash from the email, so the link works in
 * any browser or device (the PKCE `/auth/callback` needs the verifier cookie of the sign-up browser).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const parsed = emailConfirmSchema.safeParse(Object.fromEntries(searchParams));

  if (parsed.success) {
    const { token_hash, type, next } = parsed.data;
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      const appOrigin = new URL(clientEnv.NEXT_PUBLIC_APP_URL).origin;
      return NextResponse.redirect(new URL(nextFromEmailLink(next, [origin, appOrigin]), origin));
    }
    logger.warn("Email confirmation failed", { code: error.code, status: error.status });
  } else {
    logger.warn("Email confirmation link malformed");
  }

  return NextResponse.redirect(new URL(`${routes.login}?error=auth_confirm`, origin));
}
