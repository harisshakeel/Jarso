import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "@jarso/core/lib";
import {
  createClient as createSupabaseClient,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { z } from "zod";
import { clientEnv } from "@/config/env.client";
import type { Database } from "@/types";
import { supabaseFetch } from "../timed-fetch";
import { createStatelessClient } from "./stateless";

/** The signed-in user, the same shape as auth's `SessionUser` (lib cannot import a feature). */
export type ScopeUser = { id: string; email: string | null };

export type RequestScope = { user: ScopeUser; client: SupabaseClient<Database> };

const BEARER = /^Bearer\s+(\S+)$/i;

const signedOut = () => new AppError("UNAUTHORIZED", "You must be signed in");

/**
 * What a usable access token claims: a real (not anonymous) signed-in user. Anything else, a
 * service-role or anon key included, is not a user and is refused.
 */
const userClaims = z.object({
  sub: z.uuid(),
  role: z.literal("authenticated"),
  aud: z.union([
    z.literal("authenticated"),
    z.array(z.string()).refine((aud) => aud.includes("authenticated")),
  ]),
  is_anonymous: z.literal(false).optional(),
  email: z.unknown().optional(),
});

const storage = new AsyncLocalStorage<RequestScope>();

/**
 * Verifies an `Authorization: Bearer <access token>` header with `getClaims` (no session is
 * stored or refreshed). A header that is unusable in any way is UNAUTHORIZED. The token is never
 * logged or put in an error; it is returned only so the caller can build the scoped client.
 */
export async function verifyBearer(header: string): Promise<ScopeUser & { token: string }> {
  const token = BEARER.exec(header.trim())?.[1];
  if (!token) throw signedOut();

  const { data, error } = await createStatelessClient().auth.getClaims(token);
  // A timeout is not "signed out": the phone keeps its session and tries again.
  if (error && isAuthRetryableFetchError(error)) {
    throw new AppError("UNAVAILABLE", "Jarso is taking a while. Please try again.", {
      cause: error,
    });
  }
  const claims = userClaims.safeParse(data?.claims);
  if (error || !claims.success) throw signedOut();

  const { sub, email } = claims.data;
  return { id: sub, email: typeof email === "string" ? email : null, token };
}

/**
 * Runs `fn` as the bearer's user for routes that opt in (`withApi(…, { bearer: true })`).
 * With no `Authorization` header `fn` runs unscoped, on the cookie session. With one, it is
 * verified (a bad one throws and never falls back to cookies) and `fn` runs in a scope where
 * `createClient()` returns a client acting as that user and `getCurrentUser()` returns them.
 */
export async function runInBearerScope<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  const header = request.headers.get("authorization");
  if (header === null) return fn();

  const { token, ...user } = await verifyBearer(header);
  const client = createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // `accessToken` (not a global header): any `client.auth.*` call throws instead of quietly
      // running without the user.
      accessToken: async () => token,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: supabaseFetch },
      db: { retry: false },
    },
  );
  return storage.run({ user, client }, fn);
}

/** The active bearer scope, or undefined on the cookie path. */
export function currentScope(): RequestScope | undefined {
  return storage.getStore();
}
