import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/config/env.client";
import { serverEnv } from "@/config/env.server";
import { supabaseFetch } from "@/lib/timed-fetch";
import type { Database } from "@/types";

/**
 * Privileged client that BYPASSES RLS. Server-only.
 * Use only for trusted backend work (webhooks, jobs, admin ops) — never with user-controlled filters
 * without explicit authorization checks first.
 */
export function createAdminClient() {
  if (!serverEnv.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is not set");
  }

  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SECRET_KEY,
    {
      db: { retry: false },
      global: { fetch: supabaseFetch },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
