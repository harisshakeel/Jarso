import { randomUUID } from "node:crypto";
import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalUrl, loadLocalSupabase } from "./local-supabase";

/**
 * Hard guard before any test runs. When local Supabase is up, proves the app server talks to
 * it: a throwaway user created on the LOCAL stack must be able to sign in through the app.
 * A server pointed anywhere else fails that sign-in (creating nothing there) and the run aborts.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const local = loadLocalSupabase();
  if (!local) {
    if (process.env.CI) throw new Error("[e2e] CI must start local Supabase before the e2e run.");
    console.warn("[e2e] Local Supabase is not running (pnpm db:start): onboarding tests skip.");
    return;
  }
  if (process.env.E2E_BASE_URL) {
    console.warn(
      "[e2e] E2E_BASE_URL is set: onboarding tests skip (they need the managed server).",
    );
    return;
  }
  assertLocalUrl(local.url);

  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error("[e2e] No baseURL configured.");

  const admin = createClient(local.url, local.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `e2e-preflight-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`[e2e] Could not create the preflight user locally: ${error.message}`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page
      .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 })
      .catch(() => {
        throw new Error("[e2e] The app server is not using local Supabase. Aborting the run.");
      });
  } finally {
    await browser.close();
    await admin.auth.admin.deleteUser(data.user.id);
  }
}
