import { randomInt, randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { expireAccessToken } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/**
 * Parent settings: rename a child, change the family timezone, remove a child. Removing signs
 * the child out everywhere, frees the nickname and deletes the account. Runs against the LOCAL
 * Supabase stack with fresh parents each run (see onboarding.spec.ts for the conventions).
 */

test.skip(!loadLocalSupabase(), "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Settings e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const NO_MATCH = "Hmm, that didn't match. Check with your parent.";

const run = randomUUID().slice(0, 8);
const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const password = `pw-${randomUUID()}`;
const parentEmail = `e2e-settings-${run}@example.com`;
const at = (path: string) => (url: URL) => url.pathname === path;

const state = { familyCode: "" };

async function newActor(browser: Browser, ip = randomIp()): Promise<Page> {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  return context.newPage();
}

async function addChild(parent: Page, nickname: string, pin: string): Promise<void> {
  await parent.goto("/parent/children/new");
  await parent.getByRole("textbox", { name: "Nickname", exact: true }).fill(nickname);
  await parent.getByLabel("PIN", { exact: true }).fill(pin);
  const consent = parent.getByRole("checkbox", { name: "I am this child's parent or guardian" });
  await consent.click();
  await expect(consent).toBeChecked();
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
}

async function childSignIn(child: Page, nickname: string, pin: string): Promise<void> {
  await child.goto("/sign-in/child");
  const code = child.getByLabel("Family code");
  await expect(async () => {
    await code.fill(state.familyCode);
    await expect(code).toHaveValue(state.familyCode, { timeout: 1_000 });
  }).toPass();
  await child.getByLabel("Your nickname").fill(nickname);
  await child.getByLabel("Your PIN").fill(pin);
  await child.getByRole("button", { name: "Sign in" }).click();
}

test("setup: parent signs up, creates a family and adds Sam", async ({ browser }) => {
  const parent = await newActor(browser);
  await parent.goto("/signup");
  await parent.getByLabel("Name", { exact: true }).fill("Settings Parent");
  await parent.getByLabel("Email", { exact: true }).fill(parentEmail);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"));
  await parent.getByRole("button", { name: "Create family" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  const card = parent.locator("[data-slot=card]", { hasText: "Give this code to your child" });
  state.familyCode = ((await card.getByText(/^[A-Z2-9]{6}$/).textContent()) ?? "").trim();
  expect(state.familyCode).toMatch(/^[A-Z2-9]{6}$/);
  await addChild(parent, "Sam", "1234");
});

test("settings: gear opens the parent settings; rename and timezone persist", async ({
  browser,
}) => {
  const parent = await newActor(browser);
  await parent.goto("/login");
  await parent.getByLabel("Email", { exact: true }).fill(parentEmail);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Sign in" }).click();
  await expect(parent).toHaveURL(at("/parent"));

  await parent.getByRole("link", { name: "Settings" }).click();
  await expect(parent).toHaveURL(at("/parent/settings"));
  await expect(parent.getByRole("heading", { name: "Settings" })).toBeVisible();

  // Rename Sam → Sammy.
  await parent.getByRole("button", { name: "Rename Sam" }).click();
  await parent.getByRole("textbox", { name: "Nickname", exact: true }).fill("Sammy");
  await parent.getByRole("button", { name: "Save nickname" }).click();
  await expect(parent.getByText("Nickname updated")).toBeVisible();
  await expect(parent.getByRole("listitem").filter({ hasText: "Sammy" })).toBeVisible();

  // The old nickname no longer signs in; the new one does.
  const child = await newActor(browser);
  await childSignIn(child, "Sam", "1234");
  await expect(child.getByText(NO_MATCH)).toBeVisible();
  await childSignIn(child, "Sammy", "1234");
  await expect(child).toHaveURL(at("/child"));
  await expect(child.getByRole("heading", { name: "Hi, Sammy!" })).toBeVisible();

  // Timezone.
  await parent.getByRole("combobox", { name: "Timezone" }).click();
  await parent.getByRole("option", { name: "Asia/Karachi" }).click();
  await parent.getByRole("button", { name: "Save", exact: true }).click();
  await expect(parent.getByText("Family settings saved")).toBeVisible();
  await parent.reload();
  await expect(parent.getByRole("combobox", { name: "Timezone" })).toContainText("Asia/Karachi");
});

test("remove: Sammy is signed out everywhere, the nickname is free again", async ({ browser }) => {
  const child = await newActor(browser);
  await childSignIn(child, "Sammy", "1234");
  await expect(child).toHaveURL(at("/child"));

  const parent = await newActor(browser);
  await parent.goto("/login");
  await parent.getByLabel("Email", { exact: true }).fill(parentEmail);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Sign in" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await parent.goto("/parent/settings");

  await parent.getByRole("button", { name: "Remove Sammy" }).click();
  const dialog = parent.getByRole("alertdialog");
  await expect(dialog.getByText("Remove Sammy from your family?")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep Sammy" }).click();
  await expect(dialog).toBeHidden();
  await expect(parent.getByRole("listitem").filter({ hasText: "Sammy" })).toBeVisible();

  await parent.getByRole("button", { name: "Remove Sammy" }).click();
  await parent.getByRole("alertdialog").getByRole("button", { name: "Remove Sammy" }).click();
  await expect(parent.getByText("Sammy was removed from your family")).toBeVisible();
  await expect(parent.getByText("No children yet.")).toBeVisible();

  // The signed-in device is out once its token must refresh; the PIN no longer works anywhere.
  await expireAccessToken(child);
  await child.reload();
  await expect(child).toHaveURL(at("/sign-in/child"));
  await childSignIn(child, "Sammy", "1234");
  await expect(child.getByText(NO_MATCH)).toBeVisible();

  // The nickname is free for a new child, who signs in with a new PIN.
  await addChild(parent, "Sammy", "5678");
  const again = await newActor(browser);
  await childSignIn(again, "Sammy", "5678");
  await expect(again).toHaveURL(at("/child"));
});
