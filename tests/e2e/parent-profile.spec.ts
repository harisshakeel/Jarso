import { randomInt, randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { completeParentProfile } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/**
 * Parent profile completion (ADR 0008): a new parent sees a dialog that blocks the app until
 * date of birth, country and gender are saved; the details can be edited from settings.
 * Runs against the LOCAL Supabase stack with fresh parents each run.
 */

test.skip(!loadLocalSupabase(), "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Profile e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const password = `pw-${randomUUID()}`;
const at = (path: string) => (url: URL) => url.pathname === path;

async function newActor(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
  });
  return context.newPage();
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Profile Parent");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(at("/parent/setup"));
}

test("a new parent is blocked until the profile is complete", async ({ browser }) => {
  const page = await newActor(browser);
  await signUp(page, `e2e-profile-${run}@example.com`);

  const dialog = page.getByRole("alertdialog", { name: "Finish your profile" });
  await expect(dialog).toBeVisible();
  // The page behind is hidden from interaction while the dialog is open.
  await expect(page.getByRole("button", { name: "Create family" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  // Under 18 is refused with a message on the field.
  await dialog.getByLabel("Date of birth", { exact: true }).fill("2015-01-01");
  await dialog.getByRole("combobox", { name: "Country" }).click();
  await page.getByRole("option", { name: "Pakistan", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Gender" }).click();
  await page.getByRole("option", { name: "Female", exact: true }).click();
  await dialog.getByRole("button", { name: "Save and continue" }).click();
  await expect(dialog.getByText("You need to be 18 or over")).toBeVisible();

  await completeParentProfile(page, { country: "Pakistan", gender: "Female" });
  await expect(page.getByText("Thanks, you're all set")).toBeVisible();

  // Unblocked: the family can be created, and the dialog does not come back.
  await page.getByRole("button", { name: "Create family" }).click();
  await expect(page).toHaveURL(at("/parent"));
  await expect(dialog).toHaveCount(0);

  // Settings shows the saved details and lets the parent change them.
  await page.goto("/parent/settings?tab=you");
  await expect(page.getByLabel("Date of birth", { exact: true })).toHaveValue("1985-06-15");
  await expect(page.getByRole("combobox", { name: "Country" })).toContainText("Pakistan");
  await page.getByRole("combobox", { name: "Gender" }).click();
  await page.getByRole("option", { name: "Prefer not to say", exact: true }).click();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Details saved")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Gender" })).toContainText("Prefer not to say");
});

test("a parent can sign out from the dialog without completing it", async ({ browser }) => {
  const page = await newActor(browser);
  await signUp(page, `e2e-profile-out-${run}@example.com`);

  const dialog = page.getByRole("alertdialog", { name: "Finish your profile" });
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(at("/login"));

  // Signing back in brings the dialog back: nothing was skipped.
  await page.getByLabel("Email", { exact: true }).fill(`e2e-profile-out-${run}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(dialog).toBeVisible();
});

test("a parent with children who never completed the profile sees the dialog, not an error", async ({
  browser,
}) => {
  const page = await newActor(browser);
  const email = `e2e-profile-kids-${run}@example.com`;
  await signUp(page, email);
  await completeParentProfile(page);
  await page.getByRole("button", { name: "Create family" }).click();
  await expect(page).toHaveURL(at("/parent"));
  await page.getByRole("link", { name: "Add a child" }).first().click();
  await page.getByLabel("Nickname").fill("Kit");
  await page.getByLabel("PIN", { exact: true }).fill("1234");
  await page.getByRole("checkbox", { name: "I am this child's parent or guardian" }).click();
  await page.getByRole("button", { name: "Add child" }).click();
  await expect(page).toHaveURL(at("/parent"));
  await page.getByRole("link", { name: "Kit", exact: true }).click();
  await expect(page).toHaveURL(/\/parent\/children\/[0-9a-f-]+$/);
  const childPath = new URL(page.url()).pathname;

  // An account from before profile completion shipped: a family and a child, but no details.
  const local = loadLocalSupabase();
  if (!local) throw new Error("Local Supabase is required.");
  const admin = createClient(local.url, local.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: users, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  expect(listError).toBeNull();
  const userId = users.users.find((u) => u.email === email)?.id;
  if (!userId) throw new Error("Parent not found.");
  const { error } = await admin.from("parent_details").delete().eq("profile_id", userId);
  expect(error).toBeNull();

  const dialog = page.getByRole("alertdialog", { name: "Finish your profile" });
  for (const path of ["/parent", childPath]) {
    await page.goto(path);
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  }

  await completeParentProfile(page);
  await expect(dialog).toHaveCount(0);
});
