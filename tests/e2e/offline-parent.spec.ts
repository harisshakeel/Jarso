import { randomInt, randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { completeParentProfile } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** Online-only parent actions refuse cleanly while offline, against LOCAL Supabase. */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Offline e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const email = `e2e-offline-parent-${run}@example.com`;
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

const OFFLINE = "You're offline, try again when connected";

let parent: Page;
let parentContext: BrowserContext;
let childBase = "";

const dueNow = () => parent.getByRole("region", { name: "Due now" });

test.beforeAll(async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL;
  parentContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  parent = await parentContext.newPage();

  await parent.goto("/signup");
  await parent.getByLabel("Name", { exact: true }).fill("Alex Parent");
  await parent.getByLabel("Email", { exact: true }).fill(email);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"));
  await completeParentProfile(parent);
  await parent.getByRole("button", { name: "Create family" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await parent.getByRole("link", { name: "Add a child" }).first().click();
  await parent.getByLabel("Nickname").fill("Sam");
  await parent.getByLabel("PIN", { exact: true }).fill("1234");
  await parent.getByRole("checkbox", { name: "I am this child's parent or guardian" }).click();
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await parent.getByRole("link", { name: "Sam", exact: true }).click();
  await expect(parent).toHaveURL(/\/parent\/children\/[0-9a-f-]+$/);
  childBase = new URL(parent.url()).pathname;

  await parent.goto(`${childBase}/allowance`);
  await parent.getByLabel("Amount").fill("100");
  await parent.getByRole("group").getByText("Weekly", { exact: true }).click();
  await parent.getByRole("button", { name: "Save allowance" }).click();
  await expect(dueNow()).toBeVisible();
});

test.afterAll(async () => {
  await parentContext.close();
});

test("parent confirms a handover offline and sees the warning; nothing is recorded after reconnecting", async () => {
  await dueNow()
    .getByRole("link", { name: /^Allowance/ })
    .click();
  const confirm = parent.getByRole("button", { name: "Confirm I handed it over" });
  await expect(confirm).toBeEnabled();

  await parentContext.setOffline(true);
  await confirm.click();
  // The offline banner repeats this copy, so look inside the form itself.
  await expect(parent.locator("form").getByText(OFFLINE)).toBeVisible();
  await expect(parent).not.toHaveURL(at(childBase));

  await parentContext.setOffline(false);
  await parent.waitForTimeout(5_000);
  await parent.goto(childBase);
  await expect(dueNow().getByRole("link", { name: /^Allowance/ })).toBeVisible();

  await dueNow()
    .getByRole("link", { name: /^Allowance/ })
    .click();
  await parent.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(parent).toHaveURL(at(childBase));
  await expect(dueNow()).toHaveCount(0);
});

test("rename offline keeps the typed nickname and saves once back online", async () => {
  await parent.goto("/parent/settings?tab=children");
  await parent.getByRole("button", { name: "Rename Sam" }).click();
  const nickname = parent.getByRole("textbox", { name: "Nickname", exact: true });
  await nickname.fill("Sammy");

  await parentContext.setOffline(true);
  await parent.getByRole("button", { name: "Save nickname" }).click();
  await expect(parent.getByRole("dialog").getByText(OFFLINE)).toBeVisible();
  await expect(nickname).toHaveValue("Sammy");

  await parentContext.setOffline(false);
  await parent.getByRole("button", { name: "Save nickname" }).click();
  await expect(parent.getByText("Nickname updated")).toBeVisible();
});

test("sign out offline shows the warning and keeps the user signed in", async () => {
  await parent.goto(childBase);
  await parentContext.setOffline(true);
  await parent.getByRole("button", { name: "Sign out" }).click();
  await expect(
    parent
      .locator("form")
      .filter({ has: parent.getByRole("button", { name: "Sign out" }) })
      .getByText(OFFLINE),
  ).toBeVisible();
  await expect(parent).toHaveURL(at(childBase));

  await parentContext.setOffline(false);
  await parent.reload();
  await expect(parent).toHaveURL(at(childBase));
  await expect(parent.getByRole("button", { name: "Sign out" })).toBeVisible();

  await parent.getByRole("button", { name: "Sign out" }).click();
  await expect(parent).toHaveURL(at("/login"));
});
