import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { clientEnv } from "@/config/env.client";
import { isTimedFetchError, supabaseFetch } from "@/lib/timed-fetch";
import type { Database } from "@/types";

const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

/**
 * Refreshes the Supabase session cookie and returns the response carrying it,
 * plus the verified claims (null when signed out) and `unavailable` when Supabase timed out.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: { fetch: supabaseFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options);
          // Prevent CDNs caching a response that carries a session cookie.
          for (const [key, value] of Object.entries(headers ?? {}))
            response.headers.set(key, value);
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — it refreshes the token.
  const { data, error } = await supabase.auth.getClaims();

  // Supabase did not answer: the session is unknown, not signed out.
  const unavailable =
    !!error && (isAuthRetryableFetchError(error) || isTimedFetchError(error.cause));

  return { response, claims: data?.claims ?? null, unavailable };
}

/** Build a redirect that keeps refreshed session cookies + cache headers from `source`. */
export function redirectWithSession(
  request: NextRequest,
  source: NextResponse,
  pathname: string,
  searchParams?: Record<string, string>,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = new URLSearchParams(searchParams).toString();

  const redirect = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) redirect.cookies.set(cookie);
  for (const header of CACHE_HEADERS) {
    const value = source.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}
