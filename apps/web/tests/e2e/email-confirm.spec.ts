import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadLocalSupabase } from "./local-supabase";

/**
 * The confirmation email link works in a browser that never saw the sign-up (no PKCE verifier
 * cookie). The local stack has confirmations off, so the admin API mints the same token hash
 * the email template would carry, and the link is built the way the template builds it.
 */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Needs the server playwright.config starts.");

/** `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo | urlquery }}` */
function confirmLink(tokenHash: string, redirectTo: string): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type: "email", next: redirectTo });
  return `/auth/confirm?${params}`;
}

test("a confirmation link opened in another browser signs the parent in and keeps next", async ({
  browser,
  baseURL,
}) => {
  if (!local || !baseURL) throw new Error("unreachable: skipped above");
  const admin = createClient(local.url, local.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const next = "/invite?code=ZZZZ22";
  // What the signUp action sends as emailRedirectTo.
  const redirectTo = `${baseURL}/auth/callback?next=${encodeURIComponent(next)}`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "signup",
    email: `e2e-confirm-${randomUUID().slice(0, 8)}@example.com`,
    password: `pw-${randomUUID()}`,
    options: { redirectTo },
  });
  expect(error).toBeNull();
  const tokenHash = data.properties?.hashed_token ?? "";

  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.goto(confirmLink(tokenHash, redirectTo));
  await expect(page).toHaveURL((url) => url.pathname + url.search === next);

  // Used once: the same link again goes to login with a calm message.
  const other = await (await browser.newContext({ baseURL })).newPage();
  await other.goto(confirmLink(tokenHash, redirectTo));
  await expect(other).toHaveURL((url) => url.pathname === "/login");
  await expect(other.getByText("We couldn't confirm your email.", { exact: false })).toBeVisible();
});
