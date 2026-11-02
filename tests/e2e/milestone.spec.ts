import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { completeParentProfile, readFamilyCode, waitForHydration } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/**
 * The whole first milestone in one run (REQUIREMENTS.md, first-milestone acceptance criteria),
 * with one parent and one child in two browsers, against the LOCAL Supabase stack. Time moves
 * with the demo clock (D11) from the parent's Settings, as in the Demo 2 script: the server runs
 * with FEATURE_DEMO_CLOCK=true (playwright.config.ts) and the family is marked as a demo family
 * through the admin client, as the demo seed does. Push is off throughout (no VAPID keys).
 */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Milestone e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let admin: SupabaseClient;
let parent: Page;
let child: Page;
let childBase = "";
let childId = "";
let familyId = "";
/** The allowance's first date: the family's today plus a week, so nothing is due until then. */
let firstOn = "";
let occurrenceId = "";

const parentJar = (name: "Spend" | "Save") => parent.getByRole("region", { name: `${name} jar` });
const childJar = (name: "Spend" | "Save") => child.getByRole("region", { name: `${name} jar` });
const childInboxTab = () =>
  child.getByRole("navigation", { name: "Child" }).getByRole("link", { name: /News/ });

/** Both sides' jars, exact on the parent's side. */
async function expectJars(spend: string, save: string) {
  await parent.goto(childBase);
  await expect(parentJar("Spend")).toContainText(`US$${spend}.00`);
  await expect(parentJar("Save")).toContainText(`US$${save}.00`);
  await child.goto("/child");
  await expect(childJar("Spend")).toContainText(`US$${spend}`);
  await expect(childJar("Save")).toContainText(`US$${save}`);
}

/** `YYYY-MM-DD` plus `days`. */
function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Presses a Demo clock button and waits until the card shows the family's new today. */
async function moveClock(label: "+1 day" | "+7 days", today: string) {
  await parent.goto("/parent/settings");
  const card = parent.locator("[data-slot=card]", { hasText: "Demo clock" });
  await card.getByRole("button", { name: label, exact: true }).click();
  await expect(card.locator(`time[datetime="${today}"]`)).toBeVisible();
}

/** Opens a Save sheet from Move my money, fills the amount and submits. Returns the open sheet. */
async function ask(button: "Take out" | "Put in", amount: string, submit: "Ask" | "Put in") {
  await child.goto("/child/requests");
  await child.getByRole("button", { name: new RegExp(button) }).click();
  const sheet = child.getByRole("dialog");
  await sheet.getByLabel("Amount").fill(amount);
  await sheet.getByRole("button", { name: submit, exact: true }).click();
  return sheet;
}

test.beforeAll(async ({ browser }) => {
  if (!local) return;
  admin = createClient(local.url, local.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const baseURL = test.info().project.use.baseURL;
  parent = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();
  child = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();

  // Parent-started onboarding: sign up, family, child; the child signs in with code and PIN.
  await parent.goto("/signup");
  await waitForHydration(parent);
  await parent.getByLabel("Name", { exact: true }).fill("Alex Parent");
  await parent.getByLabel("Email", { exact: true }).fill(`e2e-milestone-${run}@example.com`);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"), { timeout: 20_000 });
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

  await waitForHydration(child);
  const codeField = child.getByLabel("Family code");
  await expect(async () => {
    await codeField.fill(code);
    await expect(codeField).toHaveValue(code.toUpperCase(), { timeout: 1_000 });
  }).toPass();
  await child.getByLabel("Your nickname").fill("Sam");
  await child.getByLabel("Your PIN").fill("1234");
  await child.getByRole("button", { name: "Sign in" }).click();
  await expect(child).toHaveURL(at("/child"));

  const { data: member, error } = await admin
    .from("family_members")
    .select("family_id")
    .eq("profile_id", childId)
    .single();
  if (error) throw new Error(`Family lookup failed: ${error.message}`);
  familyId = member.family_id;
});

test.afterAll(async () => {
  await parent?.context().close();
  await child?.context().close();
});

test("parent sets a weekly allowance from next week and a weekly spending limit", async () => {
  const { data: today, error } = await admin.rpc("family_today", { p_family_id: familyId });
  expect(error).toBeNull();
  firstOn = addDays(String(today), 7);

  await parent.goto(`${childBase}/allowance`);
  await parent.getByLabel("Amount").fill("500");
  await parent.getByRole("group").getByText("Weekly", { exact: true }).click();
  await parent.getByLabel("First one on").fill(firstOn);
  await parent.getByRole("button", { name: "Save allowance" }).click();
  await expect(parent).toHaveURL(at(childBase));
  await expect(
    parent.getByRole("region", { name: "Allowance", exact: true }).getByText(/^US\$500\.00 every/),
  ).toBeVisible();
  // Nothing is due yet.
  await expect(parent.getByRole("region", { name: "Due now" })).toHaveCount(0);

  await parent.goto(`${childBase}/rules`);
  const spending = parent.getByRole("group", { name: "Spending" });
  await spending.getByRole("button", { name: "Add a spending limit" }).click();
  await spending.getByRole("radio", { name: "A week" }).check({ force: true });
  await spending.getByLabel("Amount").fill("200");
  await spending.getByRole("button", { name: "Save", exact: true }).click();
  await expect(parent.getByText("Tell me when Sam spends more than US$200 a week")).toBeVisible();

  await child.goto("/child");
  await expect(child.getByText("waiting for a parent")).toHaveCount(0);
});

test("a week on the demo clock: due once, no balance change, badge and notice on both sides", async () => {
  const { error } = await admin
    .from("families")
    .update({ demo_clock_enabled: true })
    .eq("id", familyId);
  expect(error).toBeNull();

  await moveClock("+7 days", firstOn);

  const { data: due, error: dueError } = await admin
    .from("allowance_occurrences")
    .select("id")
    .eq("child_id", childId)
    .eq("status", "due");
  expect(dueError).toBeNull();
  expect(due).toHaveLength(1);
  occurrenceId = due?.[0]?.id ?? "";

  // Due badge on both sides; falling due changes no balance.
  await parent.goto(childBase);
  await expect(
    parent.getByRole("region", { name: "Due now" }).getByRole("link", { name: /^Allowance/ }),
  ).toHaveCount(1);
  await expect(parentJar("Spend")).toContainText("US$0.00");
  await expect(parentJar("Save")).toContainText("US$0.00");
  await child.goto("/child");
  await expect(child.getByText("US$500 on its way · waiting for a parent")).toBeVisible();
  await expect(childJar("Spend")).toContainText("US$0");
  await expect(childJar("Save")).toContainText("US$0");

  // The due-day notice, in-app with push off.
  await expect(childInboxTab()).toContainText("1");
  await childInboxTab().click();
  await expect(child.getByText(/Your US\$500(\.00)? allowance is due/)).toBeVisible();
  await parent.goto("/parent/inbox");
  await expect(parent.getByText("Pings on this device")).toHaveCount(0);
  await expect(
    parent.getByRole("link", { name: /Sam's US\$500(\.00)? allowance is due/ }),
  ).toBeVisible();
});

test("still unconfirmed three days later, the parent gets a reminder", async () => {
  for (const day of [1, 2, 3]) await moveClock("+1 day", addDays(firstOn, day));

  await parent.goto("/parent/inbox");
  const reminder = parent
    .getByRole("listitem")
    .filter({ hasText: /Still due: Sam's US\$500(\.00)? allowance/ });
  await expect(reminder).toBeVisible();
  await expect(reminder).toContainText("Due 3 days ago");
  // Still the one occurrence, nothing posted.
  const { count } = await admin
    .from("allowance_occurrences")
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId)
    .eq("status", "due");
  expect(count).toBe(1);
});

test("the handover posts the split to Spend and Save exactly once", async () => {
  await parent.goto(childBase);
  await parent
    .getByRole("region", { name: "Due now" })
    .getByRole("link", { name: /^Allowance/ })
    .click();
  await expect(parent.getByRole("heading", { name: "Hand over to Sam" })).toBeVisible();
  await parent.getByLabel("Save (you keep)", { exact: true }).fill("200");
  await expect(parent.getByLabel("Spend (cash to Sam)")).toHaveValue("300.00");
  await parent.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(parent).toHaveURL(at(childBase));
  await expect(parent.getByRole("region", { name: "Due now" })).toHaveCount(0);

  // One cash line and one savings line for the occurrence, no more.
  const { count } = await admin
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("source_id", occurrenceId);
  expect(count).toBe(2);

  await expectJars("300", "200");
  await expect(child.getByText("waiting for a parent")).toHaveCount(0);
});

test("a purchase over the weekly limit is recorded and the parent gets a limit notice", async () => {
  await child.goto("/child");
  await child.getByRole("button", { name: "Spent something?" }).click();
  const sheet = child.getByRole("dialog");
  await sheet.getByLabel("Amount").fill("250");
  await sheet.getByLabel("Name it (optional)").fill("Trainers");
  await sheet.getByRole("radio", { name: "Clothes" }).check({ force: true });
  await sheet.getByRole("button", { name: "Write it down", exact: true }).click();
  await expect(childJar("Spend")).toContainText("US$50");

  await child.goto("/child/diary");
  await expect(child.getByRole("region", { name: "History" }).getByText("Trainers")).toBeVisible();

  await parent.goto("/parent/inbox");
  await expect(
    parent.getByRole("listitem").filter({ hasText: "Sam went over a spending limit" }),
  ).toBeVisible();
  await expectJars("50", "200");
});

test("a withdrawal is reserved while pending and approved, and posts only on handover", async () => {
  const sheet = await ask("Take out", "150", "Ask");
  await expect(sheet.getByRole("status").first()).toHaveText("Sent to your parent");
  await sheet.getByRole("button", { name: "Done" }).click();

  await child.goto("/child/requests");
  await expect(childJar("Save")).toContainText("US$200");
  await expect(childJar("Save")).toContainText("US$150 waiting to come out");
  // The reserved money can't be asked for again.
  const again = await ask("Take out", "100", "Ask");
  await expect(again.getByRole("status").first()).toHaveText("You can take out up to US$50");
  await again.getByRole("button", { name: "Close" }).click();

  await parent.goto("/parent/inbox");
  await expect(
    parent
      .getByRole("listitem")
      .filter({ hasText: "Sam asked to take money out of Save" })
      .filter({ hasText: /US\$150(\.00)?\. Your answer is waiting\./ }),
  ).toBeVisible();

  await parent.goto("/parent");
  await parent
    .getByRole("listitem")
    .filter({ hasText: "Sam wants US$150.00" })
    .getByRole("button", { name: "Approve" })
    .click();
  const handover = parent.getByRole("listitem").filter({ hasText: "Hand over US$150.00 to Sam" });
  await expect(handover).toBeVisible();

  // Approved, not handed over: still reserved, nothing moved.
  await child.goto("/child/requests");
  await expect(childJar("Save")).toContainText("US$200");
  await expect(childJar("Save")).toContainText("US$150 waiting to come out");

  await parent.goto("/parent");
  await handover.getByRole("button", { name: "Confirm" }).click();
  await expect(handover).toHaveCount(0);

  await child.goto("/child/inbox");
  await expect(child.getByText("Your parent said yes").first()).toBeVisible();
  await expectJars("200", "50");
});

test("a deposit posts only once the parent confirms receiving the cash", async () => {
  const sheet = await ask("Put in", "100", "Put in");
  await expect(sheet.getByRole("status").first()).toHaveText("Waiting for your parent to confirm");
  await sheet.getByRole("button", { name: "Done" }).click();

  // Held in Spend, not moved yet.
  await child.goto("/child/requests");
  await expect(childJar("Spend")).toContainText("US$200");
  await expect(childJar("Spend")).toContainText("US$100 on its way to Save");
  await expect(childJar("Save")).toContainText("US$50");

  await parent.goto("/parent/inbox");
  await expect(
    parent
      .getByRole("listitem")
      .filter({ hasText: "Sam asked to add money to Save" })
      .filter({ hasText: /US\$100(\.00)?\. Your answer is waiting\./ }),
  ).toBeVisible();

  await parent.goto("/parent");
  const item = parent.getByRole("listitem").filter({ hasText: "Sam gave you US$100.00?" });
  await item.getByRole("button", { name: "Confirm" }).click();
  await expect(item).toHaveCount(0);

  await expectJars("100", "150");
  await child.goto("/child/diary");
  await expect(
    child.getByRole("region", { name: "History" }).getByText("Moved into Save").first(),
  ).toBeVisible();
});
