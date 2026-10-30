import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** Savings withdrawals and deposits, against the LOCAL Supabase stack (see playwright.config.ts). */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Requests e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const email = `e2e-requests-${run}@example.com`;
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let parent: Page;
let child: Page;
let childBase = "";

const saveJar = () => child.getByRole("region", { name: "Save jar" });
const spendJar = () => child.getByRole("region", { name: "Spend jar" });
const history = () => child.getByRole("region", { name: "History" });

/** Opens a Save sheet from Home, fills the amount and submits. Returns the open sheet. */
async function ask(button: "Take out" | "Put in", amount: string, submit: "Ask" | "Put in") {
  await child.goto("/child");
  await child.getByRole("button", { name: button, exact: true }).click();
  const sheet = child.getByRole("dialog");
  await sheet.getByLabel("Amount").fill(amount);
  await sheet.getByRole("button", { name: submit, exact: true }).click();
  return sheet;
}

/**
 * Switches one rule on and saves its amount. Rule rows are forms in a fixed order inside their
 * section: item, week, month (the take-out section lists the cap rows, then auto-approve).
 */
async function setRule(section: "take-out" | "put-in", index: number, amount: string) {
  await parent.goto(`${childBase}/rules`);
  const row = parent.locator(`section[aria-labelledby=${section}-heading] form`).nth(index);
  await row.getByRole("switch").click();
  await row.getByLabel(/limit$/).fill(amount);
  await row.getByRole("button", { name: "Save", exact: true }).click();
  await expect(parent.getByText("Saved").first()).toBeVisible();
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

test("parent hands over 3000 and keeps 2000 in Save", async () => {
  await parent.goto(`${childBase}/allowance`);
  await parent.getByLabel("Amount").fill("3000");
  await parent.getByRole("group").getByText("Weekly", { exact: true }).click();
  await parent.getByRole("button", { name: "Save allowance" }).click();
  await parent
    .getByRole("region", { name: "Due now" })
    .getByRole("link", { name: /^Allowance/ })
    .click();
  await parent.getByLabel("Save (you keep)", { exact: true }).fill("2000");
  await parent.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(parent).toHaveURL(at(childBase));
  await expect(parent.getByRole("region", { name: "Save jar" })).toContainText("US$2,000.00");
  await expect(parent.getByRole("region", { name: "Spend jar" })).toContainText("US$1,000.00");
});

test("child takes out 500, parent approves and confirms the handover", async () => {
  const sheet = await ask("Take out", "500", "Ask");
  await expect(sheet.getByRole("status").first()).toHaveText("Sent to your parent");
  await sheet.getByRole("button", { name: "Done" }).click();

  await parent.goto("/parent");
  const item = parent.getByRole("listitem").filter({ hasText: "Sam wants US$500.00" });
  await item.getByRole("button", { name: "Approve" }).click();
  const handover = parent.getByRole("listitem").filter({ hasText: "Hand over US$500.00 to Sam" });
  await handover.getByRole("button", { name: "Confirm" }).click();
  await expect(handover).toHaveCount(0);

  await child.goto("/child");
  await expect(saveJar()).toContainText("US$1,500");
  await expect(spendJar()).toContainText("US$1,500");
  await expect(history().getByText("Save → Spend").first()).toBeVisible();
  await parent.goto(childBase);
  await expect(parent.getByRole("region", { name: "Save jar" })).toContainText("US$1,500.00");
  await expect(parent.getByRole("region", { name: "Spend jar" })).toContainText("US$1,500.00");
});

test("with auto-approve per time 300, a 200 take-out is approved at once", async () => {
  await setRule("take-out", 3, "300");
  const sheet = await ask("Take out", "200", "Ask");
  await expect(sheet.getByRole("status").first()).toHaveText(
    "Approved, your parent will hand it over",
  );
  await parent.goto("/parent");
  await expect(parent.getByText("Hand over US$200.00 to Sam")).toBeVisible();
});

test("child puts in 300 and the parent confirms it", async () => {
  const sheet = await ask("Put in", "300", "Put in");
  await expect(sheet.getByRole("status").first()).toHaveText("Waiting for your parent to confirm");
  await sheet.getByRole("button", { name: "Done" }).click();

  await parent.goto("/parent");
  const item = parent.getByRole("listitem").filter({ hasText: "Sam gave you US$300.00?" });
  await item.getByRole("button", { name: "Confirm" }).click();
  await expect(item).toHaveCount(0);

  await child.goto("/child");
  await expect(saveJar()).toContainText("US$1,800");
});

test("with auto-confirm a week 500, a 200 put-in lands in Save at once", async () => {
  await setRule("put-in", 1, "500");
  const sheet = await ask("Put in", "200", "Put in");
  await expect(sheet.getByRole("status").first()).toHaveText("Added to Save");
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(saveJar()).toContainText("US$2,000");
});

test("asking for more than is available shows what can be taken out", async () => {
  const sheet = await ask("Take out", "5000", "Ask");
  await expect(sheet.getByRole("status").first()).toHaveText(/^You can take out up to US\$/);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(child.getByRole("dialog")).toHaveCount(0);
});
