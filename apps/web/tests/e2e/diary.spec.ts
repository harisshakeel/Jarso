import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { completeParentProfile, expectSetupPage, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** The money diary: categories, money received, fixes, the weekly card and the parent notices, against the LOCAL Supabase stack. */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Diary e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const email = `e2e-diary-${run}@example.com`;
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let parent: Page;
let child: Page;
let childBase = "";

const saveJar = () => child.getByRole("region", { name: "Save jar" });
const history = () => child.getByRole("region", { name: "History" });
const line = (text: string) => history().getByRole("listitem").filter({ hasText: text });

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
  await expectSetupPage(parent);
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

test("parent hands over 1000 to Spend", async () => {
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
});

test("child records 3.50 on snacks and the line shows the snacks emoji", async () => {
  await child.goto("/child/diary");
  await child.getByRole("button", { name: "Spent something?" }).click();
  const sheet = child.getByRole("dialog");
  await sheet.getByLabel("Amount").fill("3.50");
  await sheet.getByLabel("Name it (optional)").fill("Crisps");
  await sheet.getByRole("radio", { name: "Snacks" }).check({ force: true });
  await sheet.getByRole("button", { name: "Write it down", exact: true }).click();
  await expect(line("Crisps")).toBeVisible();
  await expect(line("Crisps")).toContainText("🍫");
  await expect(line("Crisps")).toContainText("US$3.50");
});

test("money received into Save raises the Save jar", async () => {
  await child.goto("/child/diary");
  await child.getByRole("button", { name: "Got money" }).click();
  const sheet = child.getByRole("dialog");
  await sheet.getByLabel("Amount").fill("20");
  await sheet.getByRole("radio", { name: "Birthday" }).check({ force: true });
  await sheet.getByRole("radio", { name: "Save", exact: true }).check({ force: true });
  await sheet.getByLabel("Name it (optional)").fill("Birthday");
  await sheet.getByRole("button", { name: "Write it down", exact: true }).click();
  await expect(line("Got")).toBeVisible();
  await child.goto("/child");
  await expect(saveJar()).toContainText("US$20");
});

test("fixing the snacks line to 3 shows what it was", async () => {
  await child.goto("/child/diary");
  await line("Crisps").getByRole("button", { name: "Details for Crisps" }).click();
  await child.getByRole("button", { name: "Fix this" }).click();
  const sheet = child.getByRole("dialog");
  await sheet.getByLabel("Amount").fill("3");
  await sheet.getByRole("button", { name: "Save the fix" }).click();
  await expect(child.getByRole("dialog")).toHaveCount(0);
  await expect(line("Crisps")).toContainText("US$3");
  await expect(line("Crisps")).toContainText("Fixed · was US$3.50");
});

test("the card names the biggest category", async () => {
  await child.goto("/child/diary");
  await expect(child.getByRole("region", { name: "Where your money went" })).toContainText(
    "Most of your spending went on 🍫 Snacks: US$3.",
  );
});

test("the parent sees the money received and fixed notices, and the fix in history", async () => {
  await parent.goto("/parent/inbox");
  await expect(parent.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(parent.getByText("wrote down US$20 from Birthday")).toBeVisible();
  await expect(parent.getByText("fixed a purchase")).toBeVisible();

  await parent.goto(`${childBase}/history`);
  await expect(parent.getByText("Fixed · was US$3.50")).toBeVisible();
});
