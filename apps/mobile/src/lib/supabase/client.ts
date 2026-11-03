import { createTimedFetch } from "@jarso/core/lib";
import type { Database } from "@jarso/db";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { env } from "@/config";
import { secureStorage } from "./storage";

/** The app's one Supabase client: the child's session, RLS applies. Publishable key only. */
export const supabase = createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  // As on the web: no hidden PostgREST retries (TanStack Query owns retrying), so an offline
  // call fails at once instead of backing off behind a spinner.
  db: { retry: false },
  // A timeout or network failure resolves as a 503 JA503, so supabase-js and toAppError see
  // UNAVAILABLE (the web's behaviour) instead of an unreadable PostgrestError with no code.
  // Longer than the web's 8 s: phones sit on slower links.
  global: { fetch: createTimedFetch({ timeoutMs: 15_000, name: "supabase" }) },
});

// Supabase's React Native pattern: refresh tokens only while the app is in the foreground.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
