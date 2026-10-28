import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/config/env.client";
import type { Database } from "@/types";

/** Supabase client for Client Components. Runs as the signed-in user (RLS applies). */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
