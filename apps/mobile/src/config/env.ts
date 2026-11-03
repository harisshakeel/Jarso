import { z } from "zod";

// The app's only public settings. Nothing secret belongs here: EXPO_PUBLIC_* is inlined into
// the bundle anyone can unpack. This file is the only place that reads process.env.
const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: z.url(),
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  EXPO_PUBLIC_API_URL: z.url(),
});

export type Env = { supabaseUrl: string; supabasePublishableKey: string; apiUrl: string };

/** Validates the raw EXPO_PUBLIC_* values; the error names every bad variable. */
export function parseEnv(raw: Record<keyof z.input<typeof schema>, string | undefined>): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid public environment variables:\n${z.prettifyError(parsed.error)}`);
  }
  return {
    supabaseUrl: parsed.data.EXPO_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: parsed.data.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    apiUrl: parsed.data.EXPO_PUBLIC_API_URL,
  };
}

// Each var is written out in full so Expo inlines it at build time.
export const env = parseEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
});
