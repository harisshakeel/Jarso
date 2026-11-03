import "server-only";
import { createClient } from "@supabase/supabase-js";
import { clientEnv } from "@/config/env.client";
import { supabaseFetch } from "../timed-fetch";

/**
 * Publishable-key client with no storage: nothing is persisted, refreshed or read from the URL.
 * For callers without cookies (a Bearer-token API request, minting tokens for the mobile app).
 */
export function createStatelessClient() {
  return createClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: supabaseFetch },
    },
  );
}
