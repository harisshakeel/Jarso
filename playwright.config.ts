import { defineConfig, devices } from "@playwright/test";
import { loadLocalSupabase } from "./tests/e2e/local-supabase";

/**
 * E2E runs against LOCAL Supabase only (`pnpm db:start`). Keys come from `supabase status`
 * in memory (tests/e2e/local-supabase.ts). They are read here, not in globalSetup, because
 * Playwright starts the webServer before globalSetup runs.
 *
 * The app server gets the local values through `webServer.env` for both build and start.
 * Process env beats .env files in Next.js, and `__NEXT_PROCESSED_ENV` stops Next.js loading
 * .env.local at all, so nothing from the hosted project (or optional email keys) leaks in.
 * A dedicated port and reuseExistingServer: false keep it from reusing a dev server.
 */
const local = loadLocalSupabase();

const PORT = 3200;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

const serverEnv: Record<string, string> = {
  __NEXT_PROCESSED_ENV: "true",
  PORT: String(PORT),
  NEXT_PUBLIC_APP_URL: baseURL,
  NEXT_PUBLIC_SUPABASE_URL: local?.url ?? "http://127.0.0.1:54321",
  // Without local Supabase only the smoke project runs; it needs a non-empty value to build.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local?.publishableKey ?? "e2e-placeholder",
  ...(local ? { SUPABASE_SECRET_KEY: local.secretKey } : {}),
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "smoke", testMatch: "smoke.spec.ts", use: { ...devices["Desktop Chrome"] } },
    // Skips itself unless local Supabase is running and this config started the server.
    { name: "onboarding", testMatch: "onboarding.spec.ts", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm build && pnpm start",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300_000,
        env: serverEnv,
      },
});
