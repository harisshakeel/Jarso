import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** Purchases, spending limits, overspend and undo, against the LOCAL Supabase stack. */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Purchases e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const email = `e2e-purchases-${run}@example.com`;
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let parent: Page;
let child: Page;
let childBase = "";
let childId = "";

const spendJar = () => child.getByRole("region", { name: "Spend jar" });
const history = () => child.getByRole("region", { name: "History" });

/** Opens the purchase sheet, records an amount and waits for it to close. */
async function spend(amount: string, label: string): Promise<void> {
  await child.getByRole("button", { name: "Spent something?" }).click();
  const sheet = child.getByRole("dialog");
  // A fresh form every time: nothing is left over from the last purchase.
  await expect(sheet.getByLabel("Amount")).toHaveValue("");
  await expect(sheet.getByLabel("What for? (optional)")).toHaveValue("");
  await sheet.getByLabel("Amount").fill(amount);
  await sheet.getByLabel("What for? (optional)").fill(label);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
}

test.beforeAll(async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL;
  parent = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();
  child = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();

  await parent.goto("/signup");
  await parent.getByLabel("Name", { exact: true }).fill("Alex Parent");
  await parent.getByLabel("Email", { exact: true }).fill(email);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"));
  await completeParentProfile(parent);
  await parent.getByRole("button", { name: "Create family" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  const code = await readFamilyCode(parent);
  await parent.getByRole("link", { name: "Add a child" }).first().click();
  await parent.getByLabel("Nickname").fill("Sam");
  await parent.getByLabel("PIN", { exact: true }).fill("1234");
  await parent.getByRole("checkbox", { name: "I am this child's parent or guardian" }).click();
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await parent.getByRole("link", { name: "Sam", exact: true }).click();
  await expect(parent).toHaveURL(/\/parent\/children\/[0-9a-f-]+$/);
  childBase = new URL(parent.url()).pathname;
  childId = childBase.split("/").pop() ?? "";

  await child.goto("/sign-in/child");
  const codeField = child.getByLabel("Family code");
  await expect(async () => {
    await codeField.fill(code);
    await expect(codeField).toHaveValue(code.toUpperCase(), { timeout: 1_000 });
  }).toPass();
  await child.getByLabel("Your nickname").fill("Sam");
  await child.getByLabel("Your PIN").fill("1234");
  await child.getByRole("button", { name: "Sign in" }).click();
  await expect(child).toHaveURL(at("/child"));
});

test.afterAll(async () => {
  await parent.context().close();
  await child.context().close();
});

test("parent hands over 1000 to Spend and sets a week spend limit of 500", async () => {
  await parent.goto(`${childBase}/allowance`);
  await parent.getByLabel("Amount").fill("1000");
  await parent.getByRole("group").getByText("Weekly", { exact: true }).click();
  await parent.getByRole("button", { name: "Save allowance" }).click();
  await parent
    .getByRole("region", { name: "Due now" })
    .getByRole("link", { name: /^Allowance/ })
    .click();
  await parent.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(parent).toHaveURL(at(childBase));
  await expect(parent.getByRole("region", { name: "Spend jar" })).toContainText("US$1,000.00");

  await parent.goto(`${childBase}/rules`);
  await expect(parent.getByText("No spending limits yet")).toBeVisible();
  const week = parent.getByRole("switch", { name: "A week", exact: true });
  await week.click();
  await parent.getByLabel("A week limit").fill("500");
  await parent.getByRole("button", { name: "Save", exact: true }).click();
  await expect(parent.getByText("Tell me when Sam spends more than US$500 a week")).toBeVisible();
  await parent.reload();
  await expect(parent.getByText("Tell me when Sam spends more than US$500 a week")).toBeVisible();
});

test("child records two purchases and sees both in history", async () => {
  await child.goto("/child");
  await expect(spendJar()).toContainText("US$1,000");
  await spend("300", "Comic");
  await expect(history().getByText("Comic")).toBeVisible();
  await expect(spendJar()).toContainText("US$700");
  await spend("300", "Sweets");
  await expect(history().getByText("Sweets")).toBeVisible();
  await expect(history().getByText("Comic")).toBeVisible();
  await expect(spendJar()).toContainText("US$400");
});

test("the parent gets a limit_exceeded notice", async () => {
  if (!local) throw new Error("unreachable");
  const client = createClient(local.url, local.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  expect(signInError).toBeNull();
  const { data, error } = await client
    .from("notifications")
    .select("kind, child_id")
    .eq("kind", "limit_exceeded");
  expect(error).toBeNull();
  expect(data).toHaveLength(1);
  expect(data?.[0]?.child_id).toBe(childId);
});

test("a purchase above Spend is refused and nothing is recorded", async () => {
  await spend("1000", "Too much");
  const sheet = child.getByRole("dialog");
  await expect(sheet.getByText(/That's more than you have in Spend \(US\$400\)\. /)).toBeVisible();
  await expect(sheet.getByText("Record money you got first, or ask a parent.")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(child.getByRole("dialog")).toHaveCount(0);
  await expect(history().getByText("Too much")).toHaveCount(0);
  await expect(spendJar()).toContainText("US$400");
});

test("with overspend on, a purchase can take Spend below zero", async () => {
  await parent.goto(`${childBase}/rules`);
  const overspend = parent.getByRole("switch", { name: "Let Sam's Spend go below zero" });
  await overspend.click();
  await expect(overspend).toBeChecked();
  await expect(parent.getByText("Sam can record a purchase even if Spend is short.")).toBeVisible();

  await child.reload();
  await spend("500", "Game");
  await expect(history().getByText("Game")).toBeVisible();
  await expect(spendJar()).toContainText("-US$100");
});

test("child undoes the last purchase and Spend is restored", async () => {
  const line = history().getByRole("listitem").filter({ hasText: "Game" });
  await line.getByRole("button", { name: "Undo Game" }).click();
  await expect(line.getByText(/Undone/)).toBeVisible();
  await expect(spendJar()).toContainText("US$400");
});
