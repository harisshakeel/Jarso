import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** Child home (jars, allowance card, history) against the LOCAL Supabase stack. */

test.skip(!loadLocalSupabase(), "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Child home e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;
const NOTE = "Great report card!";

let parent: Page;
let child: Page;
let allowancePath = "";
let childBase = "";

async function handOver(link: RegExp): Promise<void> {
  await parent.goto(childBase);
  await parent.getByRole("region", { name: "Due now" }).getByRole("link", { name: link }).click();
  await parent.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(parent).toHaveURL(at(childBase));
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
  await parent.getByLabel("Email", { exact: true }).fill(`e2e-childhome-${run}@example.com`);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"));
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
  await parent.getByRole("link", { name: "Set up allowance" }).click();
  allowancePath = `${childBase}/allowance`;
  await expect(parent).toHaveURL(at(allowancePath));

  // Starts today, so the first allowance is due at once.
  await parent.getByLabel("Amount").fill("500");
  await parent.getByRole("group").getByText("Weekly", { exact: true }).click();
  await parent.getByRole("button", { name: "Save allowance" }).click();
  await expect(parent.getByRole("region", { name: "Due now" })).toBeVisible();

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

test("child sees jars, due badge and a revealed gift", async () => {
  await expect(child.getByText(/^US\$500 every \w+day$/)).toBeVisible();
  await expect(child.getByText(/^Next: \d{1,2} \w{3}$/)).toBeVisible();
  // Due allowance: waiting, not in the jars.
  await expect(child.getByText("US$500 waiting for a parent")).toBeVisible();
  await expect(child.getByText("Waiting money isn't in your jars yet.")).toBeVisible();
  await expect(child.getByRole("region", { name: "Spend jar" })).toContainText("US$0");
  await expect(child.getByRole("region", { name: "Save jar" })).toContainText("US$0");

  // A pending gift is a surprise: its note must not reach the child's page at all.
  await parent.goto(`${childBase}/gifts/new`);
  await parent.getByLabel("Amount").fill("50");
  await parent.getByLabel("Note for Sam (optional)").fill(NOTE);
  await parent.getByRole("button", { name: "Save gift" }).click();
  await expect(parent.getByRole("region", { name: "Due now" }).getByText(NOTE)).toBeVisible();

  await child.reload();
  await expect(child.getByText("US$500 waiting for a parent")).toBeVisible();
  expect(await child.content()).not.toContain(NOTE);

  // Hand over both: jars update, the gift shows with its note, no waiting badge.
  await handOver(/^Allowance/);
  await handOver(/^Gift/);
  await child.reload();
  await expect(child.getByRole("region", { name: "Spend jar" })).toContainText("US$550");
  await expect(child.getByRole("region", { name: "Save jar" })).toContainText("US$0");
  await expect(child.getByText("waiting for a parent")).toHaveCount(0);
  const history = child.getByRole("region", { name: "History" });
  await expect(history.getByText(NOTE)).toBeVisible();
  await expect(history.getByText("Allowance", { exact: true })).toBeVisible();

  // Pause with a message: the child sees it.
  await parent.goto(allowancePath);
  await parent.getByRole("button", { name: "Pause", exact: true }).click();
  const sheet = parent.getByRole("dialog");
  await sheet.getByLabel("Message for Sam (optional)").fill("Back after the holiday");
  await sheet.getByText("I resume it").click();
  await sheet.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(parent.getByText("Paused until a parent resumes it.")).toBeVisible();

  await child.reload();
  await expect(child.getByText("Paused", { exact: true })).toBeVisible();
  await expect(child.getByText("Paused until a parent resumes it.")).toBeVisible();
  await expect(child.getByText("Back after the holiday")).toBeVisible();
});
