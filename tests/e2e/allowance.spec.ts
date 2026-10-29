import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { completeParentProfile } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** Parent allowance and gift screens against the LOCAL Supabase stack (see playwright.config.ts). */

test.skip(!loadLocalSupabase(), "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Allowance e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let page: Page;
/** The child's page, `/parent/children/<id>`. */
let childPath = "";
/** The manage allowance page under it. */
let managePath = "";

/** `YYYY-MM-DD` of the next Sunday, 1 to 7 days ahead (UTC, so safe for any family timezone). */
function nextSunday(): { iso: string; label: string } {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + ((7 - date.getUTCDay()) % 7 || 7));
  return {
    iso: date.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(date),
  };
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  page = await context.newPage();
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill("Alex Parent");
  await page.getByLabel("Email", { exact: true }).fill(`e2e-allowance-${run}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(at("/parent/setup"));
  await completeParentProfile(page);
  await page.getByRole("button", { name: "Create family" }).click();
  await expect(page).toHaveURL(at("/parent"));
  await page.getByRole("link", { name: "Add a child" }).first().click();
  await page.getByLabel("Nickname").fill("Sam");
  await page.getByLabel("PIN", { exact: true }).fill("1234");
  await page.getByRole("checkbox", { name: "I am this child's parent or guardian" }).click();
  await page.getByRole("button", { name: "Add child" }).click();
  await expect(page).toHaveURL(at("/parent"));
  await expect(page.getByRole("region", { name: /Needs you/ })).toContainText("All caught up.");
  await page.getByRole("link", { name: "Sam", exact: true }).click();
  await expect(page).toHaveURL(/\/parent\/children\/[0-9a-f-]+$/);
  childPath = new URL(page.url()).pathname;
  managePath = `${childPath}/allowance`;
  await expect(
    page.getByRole("region", { name: "Allowance", exact: true }).getByText("No allowance yet"),
  ).toBeVisible();
  await page.getByRole("link", { name: "Set up allowance" }).click();
  await expect(page).toHaveURL(at(managePath));
  await expect(page.getByRole("heading", { level: 1, name: "Allowance" })).toBeVisible();
});

test.afterAll(async () => {
  await page.context().close();
});

test("parent sets up a weekly allowance and sees the summary", async () => {
  const sunday = nextSunday();
  await page.getByLabel("Amount").fill("500");
  await page.getByText("Weekly", { exact: true }).click();
  await page.getByLabel("First one on").fill(sunday.iso);
  await expect(page.getByText(`Every Sunday from ${sunday.label}`)).toBeVisible();
  await page.getByRole("button", { name: "Save allowance" }).click();

  // A new allowance lands on the child's page.
  await expect(page).toHaveURL(at(childPath));
  const card = page.getByRole("region", { name: "Allowance", exact: true });
  await expect(card.getByText("US$500.00 every Sunday", { exact: true })).toBeVisible();
  await expect(card.getByText(`Next: ${sunday.label}`)).toBeVisible();
});

test("parent changes the amount", async () => {
  await page.getByRole("link", { name: "Manage", exact: true }).click();
  await expect(page).toHaveURL(at(managePath));
  await page.getByRole("link", { name: "Change amount or how often" }).click();
  await expect(page).toHaveURL(at(`${managePath}/edit`));
  await page.getByLabel("Amount").fill("600");
  await page.getByRole("button", { name: "Save allowance" }).click();
  await expect(page).toHaveURL(at(managePath));
  await expect(page.getByText(/^US\$600\.00$/)).toBeVisible();
});

test("parent pauses with a message, then resumes", async () => {
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Message for Sam (optional)").fill("Paused while we're on holiday");
  await expect(sheet.getByText(/Missed weeks aren't paid later/)).toBeVisible();
  await sheet.getByText("I resume it").click();
  await sheet.getByRole("button", { name: "Pause", exact: true }).click();

  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(page.getByText("Paused until a parent resumes it.")).toBeVisible();
  await expect(page.getByText("Paused while we're on holiday")).toBeVisible();

  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Paused", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});

test("parent stops the allowance and sees the set-up form again", async () => {
  await page.getByRole("button", { name: "Stop allowance" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Stop Sam's allowance?")).toBeVisible();
  await expect(dialog.getByText("Anything already due stays due.")).toBeVisible();
  await dialog.getByRole("button", { name: "Stop allowance" }).click();
  await expect(page.getByRole("button", { name: "Save allowance" })).toBeVisible();
});

test("parent creates a gift for today and sees it in the due list", async () => {
  await page.getByLabel("Amount").fill("50");
  await page.getByText("One time", { exact: true }).click();
  await expect(page).toHaveURL(at(`${childPath}/gifts/new`));
  await expect(page.getByLabel("Amount")).toHaveValue("50");
  await page.getByLabel("Note for Sam (optional)").fill("Well done on the test");
  await page.getByRole("button", { name: "Save gift" }).click();
  await expect(page).toHaveURL(at(childPath));
  const due = page.getByRole("region", { name: "Due now" });
  await expect(due.getByText("Well done on the test")).toBeVisible();
  await expect(due.getByRole("link", { name: /Hand over/ })).toBeVisible();
});

test("parent hands over a due allowance with a split", async () => {
  // The stopped allowance from above is replaced by one that starts today, so it is due at once.
  await page.getByRole("link", { name: "Set up allowance" }).click();
  await expect(page).toHaveURL(at(managePath));
  await page.getByLabel("Amount").fill("500");
  await page.getByRole("group").getByText("Weekly", { exact: true }).click();
  await page.getByRole("button", { name: "Save allowance" }).click();
  await expect(page).toHaveURL(at(childPath));
  const due = page.getByRole("region", { name: "Due now" });
  await due.getByRole("link", { name: /^Allowance/ }).click();

  await expect(page.getByRole("heading", { name: "Hand over to Sam" })).toBeVisible();
  const spend = page.getByLabel("Spend (cash to Sam)");
  const save = page.getByLabel("Save (you keep)", { exact: true });
  await expect(page.getByText("Drag or type to change.", { exact: true })).toBeVisible();
  await expect(spend).toHaveValue("500.00");
  await expect(save).toHaveValue("0.00");

  await save.fill("200");
  await expect(spend).toHaveValue("300.00");
  await page.getByRole("button", { name: "Confirm I handed it over" }).click();

  await expect(page).toHaveURL(at(childPath));
  await expect(due.getByRole("link", { name: /^Allowance/ })).toHaveCount(0);
  // The parent sees the child's jars with exact amounts.
  await expect(page.getByRole("region", { name: "Spend jar" })).toContainText("US$300.00");
  await expect(page.getByRole("region", { name: "Save jar" })).toContainText("US$200.00");
});

test("the next handover starts from the last split", async () => {
  const due = page.getByRole("region", { name: "Due now" });
  await due.getByRole("link", { name: /^Gift/ }).click();
  await expect(page.getByText("Same split as last time. Drag or type to change.")).toBeVisible();
  await expect(page.getByLabel("Spend (cash to Sam)")).toHaveValue("30.00");
  await expect(page.getByLabel("Save (you keep)", { exact: true })).toHaveValue("20.00");
  await page.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(page).toHaveURL(at(childPath));
  await expect(page.getByRole("region", { name: "Due now" })).toHaveCount(0);
});

test("parent cancels a due gift from the handover screen", async () => {
  await page.goto(`${childPath}/gifts/new`);
  await page.getByLabel("Amount").fill("15");
  await page.getByLabel("Note for Sam (optional)").fill("Cinema money");
  await page.getByRole("button", { name: "Save gift" }).click();
  await expect(page).toHaveURL(at(childPath));

  const due = page.getByRole("region", { name: "Due now" });
  await due.getByRole("link", { name: /^Gift/ }).click();
  await page.getByRole("link", { name: "Change or cancel this gift" }).click();
  await expect(page.getByText("Change this gift.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel this gift" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Cancel this gift?")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel gift" }).click();

  await expect(page).toHaveURL(at(childPath));
  await expect(page.getByRole("region", { name: "Due now" })).toHaveCount(0);
});

test("parent marks a due allowance as not given", async () => {
  const local = loadLocalSupabase();
  if (!local) throw new Error("Local Supabase is required.");
  const admin = createClient(local.url, local.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // A week later the weekly allowance falls due again.
  const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.rpc("generate_due_occurrences", { p_now: later });
  expect(error).toBeNull();

  await page.reload();
  const due = page.getByRole("region", { name: "Due now" });
  await due.getByRole("link", { name: /^Allowance/ }).click();
  await expect(
    page.getByText("Gave less? Enter what you gave. The rest is noted as short."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mark as not given" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Mark as not given" }).click();

  await expect(page).toHaveURL(at(childPath));
  await expect(page.getByRole("region", { name: "Due now" })).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "History" }).getByText("Not given", { exact: true }),
  ).toBeVisible();
});

test("Home lists what needs the parent; handing over lands on the child page", async () => {
  const local = loadLocalSupabase();
  if (!local) throw new Error("Local Supabase is required.");
  const admin = createClient(local.url, local.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Two weeks on, the weekly allowance falls due once more.
  const later = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.rpc("generate_due_occurrences", { p_now: later });
  expect(error).toBeNull();

  await page.goto("/parent");
  const needsYou = page.getByRole("region", { name: /Needs you/ });
  const row = needsYou.getByRole("row").filter({ hasText: "Sam" });
  await expect(row).toContainText("Allowance");
  await expect(row).toContainText("US$500.00");
  await row.getByRole("link", { name: "Hand over allowance to Sam" }).click();

  await expect(page.getByRole("heading", { name: "Hand over to Sam" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(page).toHaveURL(at(childPath));

  await page
    .getByRole("navigation", { name: "Parent" })
    .getByRole("link", { name: "Home" })
    .click();
  await expect(page).toHaveURL(at("/parent"));
  await expect(needsYou).toContainText("All caught up.");
  await expect(page.getByRole("link", { name: "Sam", exact: true })).toBeVisible();
});

test("Allowance tab lists each child and Manage opens the manage page", async () => {
  const nav = page.getByRole("navigation", { name: "Parent" });
  await nav.getByRole("link", { name: "Allowance" }).click();
  await expect(page).toHaveURL(at("/parent/allowance"));
  await expect(nav.getByRole("link", { name: "Allowance" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const row = page.getByRole("row").filter({ hasText: "Sam" });
  await expect(row.getByText(/^US\$500\.00 every \w+day$/)).toBeVisible();
  await expect(row.getByText("Active", { exact: true })).toBeVisible();
  await row.getByRole("link", { name: "Manage Sam's allowance" }).click();
  await expect(page).toHaveURL(at(managePath));
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
});
