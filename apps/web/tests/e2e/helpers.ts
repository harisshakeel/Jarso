import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { LocalSupabase } from "./local-supabase";

/** Bearer for the cron routes in e2e runs; playwright.config.ts gives the app server the same. */
export const E2E_CRON_SECRET = "e2e-cron-secret-0000";

/**
 * Marks the page's Supabase session cookie as expired so the next request must use the refresh
 * token. The app verifies access tokens locally, so a revoked session only shows on refresh.
 * Decodes and re-encodes the @supabase/ssr cookie ("base64-" + base64url JSON, maybe chunked).
 */
export async function expireAccessToken(page: Page): Promise<void> {
  const context = page.context();
  const pattern = /^(sb-.+-auth-token)(?:\.(\d+))?$/;
  const parts = (await context.cookies())
    .flatMap((cookie) => {
      const match = pattern.exec(cookie.name);
      return match ? [{ cookie, base: match[1] ?? "", index: Number(match[2] ?? 0) }] : [];
    })
    .sort((a, b) => a.index - b.index);
  const first = parts[0];
  if (!first) throw new Error("No Supabase session cookie");

  const raw = parts.map((part) => part.cookie.value).join("");
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString());
  session.expires_at = 1;
  const encoded = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;

  await context.clearCookies({ name: pattern });
  const chunks = encoded.match(/.{1,3180}/g) ?? [];
  const { domain, path, sameSite, secure, httpOnly } = first.cookie;
  await context.addCookies(
    chunks.map((value, i) => ({
      name: chunks.length === 1 ? first.base : `${first.base}.${i}`,
      value,
      domain,
      path,
      sameSite,
      secure,
      httpOnly,
    })),
  );
}

/**
 * Reads the family code from the parent's Settings (where it lives), then goes back to Home.
 * Six characters from the unambiguous alphabet.
 */
export async function readFamilyCode(page: Page): Promise<string> {
  await page.goto("/parent/settings");
  const card = page.locator("[data-slot=card]", { hasText: "Give this code to your child" });
  const value = card.getByText(/^[A-Z2-9]{6}$/);
  const code = ((await value.textContent()) ?? "").trim();
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error(`Unexpected family code "${code}"`);
  await page.goto("/parent");
  return code;
}

/**
 * Fills the profile-completion dialog every new parent sees (ADR 0008) and waits for it to
 * close. Selects render their options in a portal, so options are found on the page.
 */
export async function completeParentProfile(
  page: Page,
  details: { dateOfBirth?: string; country?: string; gender?: string } = {},
): Promise<void> {
  const dialog = page.getByRole("alertdialog", { name: "One more thing." });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel("Date of birth", { exact: true })
    .fill(details.dateOfBirth ?? "1985-06-15");
  await dialog.getByRole("combobox", { name: "Country" }).click();
  await page
    .getByRole("option", { name: details.country ?? "United Kingdom", exact: true })
    .click();
  await dialog.getByRole("combobox", { name: "Gender" }).click();
  await page
    .getByRole("option", { name: details.gender ?? "Prefer not to say", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save and continue" }).click();
  await expect(dialog).toBeHidden();
}

const apiOptions = { auth: { autoRefreshToken: false, persistSession: false } };

/** A confirmed parent account on the local stack, created with the admin API. Returns its id. */
export async function createParentUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { jarso_role: "parent" },
  });
  if (error) throw new Error(`Parent creation failed: ${error.message}`);
  return data.user.id;
}

/** A fresh supabase-js client signed in with email and password: its own session and requests. */
export async function signedInClient(
  local: LocalSupabase,
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(local.url, local.publishableKey, apiOptions);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
  return client;
}

/** Creates a child account and registers it in the family as the signed-in parent. Returns its id. */
export async function addChild(
  admin: SupabaseClient,
  parent: SupabaseClient,
  child: { familyId: string; nickname: string; email: string },
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: child.email,
    password: `pw-${randomUUID()}`,
    email_confirm: true,
    app_metadata: { jarso_role: "child" },
  });
  if (error) throw new Error(`Child creation failed: ${error.message}`);
  const { error: regError } = await parent.rpc("register_child", {
    p_child_id: data.user.id,
    p_family_id: child.familyId,
    p_nickname: child.nickname,
    p_pin: "1234",
    p_consent: true,
  });
  if (regError) throw new Error(`register_child failed: ${regError.message}`);
  return data.user.id;
}

/** A weekly allowance starting today, so one occurrence is due now. Returns the occurrence id. */
export async function dueOccurrence(
  admin: SupabaseClient,
  parent: SupabaseClient,
  childId: string,
  amountMinor = 500,
): Promise<string> {
  const { error } = await parent.rpc("create_allowance", {
    p_child_id: childId,
    p_amount_minor: amountMinor,
    p_frequency: "weekly",
    p_first_on: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(`create_allowance failed: ${error.message}`);
  const { data, error: readError } = await admin
    .from("allowance_occurrences")
    .select("id")
    .eq("child_id", childId)
    .eq("status", "due")
    .single();
  if (readError) throw new Error(`Occurrence lookup failed: ${readError.message}`);
  return data.id;
}

/**
 * After "Create account" on the local stack (email confirmation off): the setup page. When it
 * does not arrive, the failure says where the page is and what the form said, so a flaky
 * sign-up explains itself instead of reading as a timeout.
 */
export async function expectSetupPage(page: Page): Promise<void> {
  try {
    await expect(page).toHaveURL((url) => url.pathname === "/parent/setup", { timeout: 45_000 });
  } catch (error) {
    // Errors are alerts; "taking a while" and "check your email" are statuses: read both.
    const said = await page
      .getByRole("alert")
      .or(page.getByRole("status"))
      .allInnerTexts()
      .catch(() => [] as string[]);
    const form = await page
      .locator("form")
      .first()
      .innerText()
      .catch(() => "");
    throw new Error(
      `Sign-up did not reach /parent/setup (page is at ${page.url()}). Alerts and statuses: ${said.join(" | ") || "none"}. The form read: ${form.replace(/\s+/g, " ").slice(0, 400) || "nothing"}`,
      { cause: error },
    );
  }
}
