// Placeholders so src/config/env.ts parses under test, as CI does for the web build.
process.env.EXPO_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-placeholder";
process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:3000";

// The same Intl polyfills app/_layout.tsx loads first on the device.
import "@/lib/intl";
