import { randomInt, randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** Purchases saved on the device while offline and sent later, against LOCAL Supabase. */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Offline e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const email = `e2e-offline-${run}@example.com`;
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let parent: Page;
let child: Page;
let childContext: BrowserContext;

const spendJar = () => child.getByRole("region", { name: "Spend jar" });
const history = () => child.getByRole("region", { name: "History" });
const pending = () => child.getByRole("region", { name: "Not sent yet" });

/** Opens the purchase sheet, records an amount and waits for it to close. */
async function spend(amount: string, label: string): Promise<void> {
  await child.getByRole("button", { name: "Spent something?" }).click();
  const sheet = child.getByRole("dialog");
  await sheet.getByLabel("Amount").fill(amount);
  await sheet.getByLabel("What for? (optional)").fill(label);
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(child.getByRole("dialog")).toHaveCount(0);
}

test.beforeAll(async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL;
  parent = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();
  childContext = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } });
  child = await childContext.newPage();

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
  const childBase = new URL(parent.url()).pathname;

  await parent.goto(`${childBase}/allowance`);
  await parent.getByLabel("Amount").fill("100");
  await parent.getByRole("group").getByText("Weekly", { exact: true }).click();
  await parent.getByRole("button", { name: "Save allowance" }).click();
  await parent
    .getByRole("region", { name: "Due now" })
    .getByRole("link", { name: /^Allowance/ })
    .click();
  await parent.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(parent).toHaveURL(at(childBase));

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
  // Purchases, pending items and history all sit on the Diary tab.
  await child.goto("/child/diary");
  await expect(spendJar()).toContainText("US$100");
});

test.afterAll(async () => {
  await parent.context().close();
  await childContext.close();
});

test("purchase made offline sends when back online", async () => {
  await childContext.setOffline(true);
  await spend("20", "Offline snack");
  await expect(pending()).toContainText("Offline snack");
  await expect(pending()).toContainText("Waiting to send");
  // Pending items are never taken off the Spend jar: it stays the server balance.
  await expect(spendJar()).toContainText("US$100");
  await expect(history().getByText("Offline snack")).toHaveCount(0);

  await childContext.setOffline(false);
  await expect(history().getByText("Offline snack")).toBeVisible();
  await expect(spendJar()).toContainText("US$80");
  await expect(pending()).toHaveCount(0);
});

test("purchase recorded once after a lost response", async () => {
  let calls = 0;
  await child.route("**/api/v1/outbox", async (route) => {
    calls += 1;
    if (calls > 1) return route.continue();
    // The server records it, but the reply never reaches the device.
    await route.fetch();
    await route.abort();
  });

  await spend("30", "Lost reply");
  await expect(history().getByText("Lost reply")).toBeVisible();
  expect(calls).toBeGreaterThan(1);
  await expect(spendJar()).toContainText("US$50");
  await child.unroute("**/api/v1/outbox");

  await child.reload();
  await expect(history().getByText("Lost reply")).toHaveCount(1);
  await expect(spendJar()).toContainText("US$50");
});

test("refused queued purchase shows Needs a look", async () => {
  await childContext.setOffline(true);
  await spend("500", "Too big");
  await expect(pending()).toContainText("Waiting to send");

  await childContext.setOffline(false);
  const line = pending().getByRole("listitem").filter({ hasText: "Too big" });
  await expect(line).toContainText(
    "That's more than you have in Spend (US$50). Record money you got first, or ask a parent.",
  );
  await expect(line.getByRole("button", { name: "Change it: Too big" })).toBeVisible();
  await expect(line.getByRole("button", { name: "Ask a parent: Too big" })).toBeVisible();
  await expect(line.getByRole("button", { name: "Remove: Too big" })).toBeVisible();
  await expect(spendJar()).toContainText("US$50");

  await line.getByRole("button", { name: "Ask a parent: Too big" }).click();
  await expect(line).toContainText("Show this to a parent and decide together.");

  await line.getByRole("button", { name: "Remove: Too big" }).click();
  await expect(pending()).toHaveCount(0);
  await expect(history().getByText("Too big")).toHaveCount(0);
});

test("Change it on a refused purchase saves the changed one", async () => {
  await childContext.setOffline(true);
  await spend("500", "Too much");
  await childContext.setOffline(false);
  const line = pending().getByRole("listitem").filter({ hasText: "Too much" });
  await expect(line).toContainText("That's more than you have in Spend (US$50).");

  await line.getByRole("button", { name: "Change it: Too much" }).click();
  const sheet = child.getByRole("dialog");
  await expect(sheet.getByLabel("Amount")).toHaveValue("500");
  await expect(sheet.getByLabel("What for? (optional)")).toHaveValue("Too much");
  await sheet.getByLabel("Amount").fill("10");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(child.getByRole("dialog")).toHaveCount(0);

  await expect(history().getByText("Too much")).toHaveCount(1);
  await expect(spendJar()).toContainText("US$40");
  await expect(pending()).toHaveCount(0);
});

test("Change it on an expired purchase sends the old one once", async () => {
  await childContext.setOffline(true);
  await spend("5", "Old snack");
  await expect(pending()).toContainText("Waiting to send");
  // Stand in for 20 failed sends: mark the stored item expired, as the outbox would.
  await child.evaluate(async (expired) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("jarso-outbox");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const store = db.transaction("items", "readwrite").objectStore("items");
    const items = await new Promise<Record<string, unknown>[]>((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
    for (const item of items) {
      store.put({ ...item, status: "needs_look", attempts: 20, message: expired });
    }
    await new Promise((resolve) => {
      store.transaction.oncomplete = resolve;
    });
    db.close();
  }, "This one waited too long. Add it again?");
  await childContext.setOffline(false);
  await child.reload();

  const line = pending().getByRole("listitem").filter({ hasText: "Old snack" });
  await expect(line).toContainText("This one waited too long. Add it again?");
  await line.getByRole("button", { name: "Change it: Old snack" }).click();
  await expect(child.getByText("Saved. Nice one.")).toBeVisible();
  await expect(child.getByRole("dialog")).toHaveCount(0);
  await expect(pending()).toHaveCount(0);
  await expect(history().getByText("Old snack")).toHaveCount(1);
  await expect(spendJar()).toContainText("US$35");
});
