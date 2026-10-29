import { randomInt, randomUUID } from "node:crypto";
import { expect, type Locator, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/**
 * The learning track (FR06, FR08, FR10, FR12) against the LOCAL Supabase stack: check-in, a full
 * mission with a mistake replayed at the end, leaving and resuming, a topic page, spaced practice,
 * and the parent's learning page.
 */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Learning e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let parent: Page;
let child: Page;
let childId = "";

/** Answers whatever step is showing with something valid (the check-in shows no right or wrong). */
async function answerAnything(page: Page): Promise<void> {
  // The innermost section holding the step's button (a topic page nests the player in a section).
  const step = page
    .locator("section")
    .filter({ has: page.getByRole("button", { name: /^(Next|Check)$/ }) })
    .last();
  const radios = step.getByRole("radio");
  const textbox = step.getByRole("textbox");
  const selects = step.getByRole("combobox");
  if ((await selects.count()) > 0) {
    for (const select of await selects.all()) await select.selectOption({ index: 1 });
  } else if ((await step.getByRole("group").count()) > 1) {
    for (const group of await step.getByRole("group").all()) {
      const first = group.locator("label").first();
      if (await first.isVisible()) await first.click();
    }
  } else if ((await radios.count()) > 0) {
    await step.locator("label").first().click();
  } else if ((await textbox.count()) > 0) {
    await textbox.fill("1");
  }
}

async function check(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Check", exact: true }).click();
}

async function next(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

function stepCard(page: Page): Locator {
  return page
    .locator("section")
    .filter({ has: page.locator("h2") })
    .first();
}

test.beforeAll(async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL;
  // en-GB so the family currency (picked from the browser locale) is GBP: amounts read "£6.50".
  parent = await (
    await browser.newContext({
      baseURL,
      locale: "en-GB",
      extraHTTPHeaders: { "x-forwarded-for": ip },
    })
  ).newPage();
  child = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();

  await parent.goto("/signup");
  await parent.getByLabel("Name", { exact: true }).fill("Robin Parent");
  await parent.getByLabel("Email", { exact: true }).fill(`e2e-learning-${run}@example.com`);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"));
  await completeParentProfile(parent);
  await parent.getByRole("button", { name: "Create family" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  const code = await readFamilyCode(parent);
  await parent.getByRole("link", { name: "Add a child" }).first().click();
  await parent.getByLabel("Nickname").fill("Kai");
  await parent.getByLabel("PIN", { exact: true }).fill("2468");
  await parent.getByRole("checkbox", { name: "I am this child's parent or guardian" }).click();
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await parent.getByRole("link", { name: "Kai", exact: true }).click();
  await expect(parent).toHaveURL(/\/parent\/children\/[0-9a-f-]+$/);
  childId = new URL(parent.url()).pathname.split("/").pop() ?? "";

  await child.goto("/sign-in/child");
  const codeField = child.getByLabel("Family code");
  await expect(async () => {
    await codeField.fill(code);
    await expect(codeField).toHaveValue(code.toUpperCase(), { timeout: 1_000 });
  }).toPass();
  await child.getByLabel("Your nickname").fill("Kai");
  await child.getByLabel("Your PIN").fill("2468");
  await child.getByRole("button", { name: "Sign in" }).click();
  await expect(child).toHaveURL(at("/child"));
});

test.afterAll(async () => {
  await parent?.context().close();
  await child?.context().close();
});

test("home offers the check-in first, and it places without scoring", async () => {
  await expect(
    child.getByRole("heading", { name: "Five quick questions. Then your first mission." }),
  ).toBeVisible();
  await child.getByRole("link", { name: "Start", exact: true }).click();
  await expect(child).toHaveURL(at("/child/learn/check-in"));
  await child.getByRole("button", { name: "Start the questions" }).click();
  for (let i = 0; i < 5; i++) {
    await expect(child.getByText(`Question ${i + 1} of 5`)).toBeVisible();
    await answerAnything(child);
    await child.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(
    child.getByRole("heading", { name: "Thanks. That helps pick where you start." }),
  ).toBeVisible();
  // No right or wrong was shown during the check-in.
  await expect(child.getByText("Have another go.")).toHaveCount(0);
  await child.getByRole("link", { name: "Go to your missions" }).click();
  await expect(child).toHaveURL(at("/child/learn"));
  await expect(child.getByRole("link", { name: /Day 1.*What's in Spend\?/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(child.getByText("Unlocks after the mission before it.").first()).toBeVisible();
});

test("a mission gives instant feedback and replays a mistake at the end", async () => {
  await child.getByRole("link", { name: /What's in Spend\?/ }).click();
  await expect(child).toHaveURL(at("/child/learn/whats-in-spend"));
  await child.getByRole("button", { name: "Start mission" }).click();

  // Step 1: the idea.
  await expect(child.getByRole("heading", { name: "Spend is the cash you hold" })).toBeVisible();
  await next(child);

  // Step 2: a choice, right first time.
  await child.getByText("A comic for £6.50").click();
  await check(child);
  await expect(child.getByRole("heading", { name: "That's it." })).toBeVisible();
  await next(child);

  // Step 3: wrong, a hint, then right on the second try.
  await child.getByRole("textbox", { name: "Your answer" }).fill("24");
  await check(child);
  await expect(child.getByRole("heading", { name: "Have another go." })).toBeVisible();
  await expect(
    child.getByText("That adds the two amounts. Buying takes money away."),
  ).toBeVisible();
  await child.getByRole("button", { name: "Try again" }).click();
  await child.getByRole("button", { name: "Hint", exact: true }).click();
  await expect(child.getByRole("list", { name: "Hints" })).toContainText("take away the price");
  await child.getByRole("textbox", { name: "Your answer" }).fill("6");
  await check(child);
  await expect(child.getByRole("heading", { name: "That's it." })).toBeVisible();
  await next(child);

  // Step 4: predict, then the outcome is explained.
  await child.getByText("No, not enough left").click();
  await check(child);
  await expect(child.getByText(/Each buy changes what's left/)).toBeVisible();
  await next(child);

  // Leave mid-mission and come back: it resumes at step 5.
  await child.goto("/child");
  await expect(child.getByRole("heading", { name: "Halfway there. Keep going." })).toBeVisible();
  await child.getByRole("link", { name: "Continue", exact: true }).click();
  await child.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(child.getByText("Step 5 of 7")).toBeVisible();

  // Step 5: sort.
  const sortStep = stepCard(child);
  for (const [item, bucket] of [
    ["Pen, £2.50", "Can buy"],
    ["Board game, £18", "Not yet"],
    ["Cinema ticket, £9", "Can buy"],
    ["Trainers, £45", "Not yet"],
    ["Book, £10", "Can buy"],
  ] as const) {
    await sortStep.getByRole("group", { name: item }).getByText(bucket, { exact: true }).click();
  }
  await check(child);
  await expect(child.getByRole("heading", { name: "That's it." })).toBeVisible();
  await next(child);

  // Step 6: a count.
  await child.getByRole("textbox", { name: "Your answer" }).fill("4");
  await check(child);
  await next(child);

  // Step 7: explain the reasoning.
  await child.getByText("So you know you can pay and what will be left").click();
  await check(child);
  await next(child);

  // The step missed first time comes back with new numbers.
  await expect(child.getByText("One more look: 1 of 1")).toBeVisible();
  await expect(
    child.getByRole("heading", { name: /You have £20 in Spend\. You buy socks for £4\.50/ }),
  ).toBeVisible();
  await child.getByRole("textbox", { name: "Your answer" }).fill("15.50");
  await check(child);
  await next(child);

  await expect(child.getByRole("heading", { name: "Mission done. Nice work." })).toBeVisible();
  await expect(child.getByText("5 of 6 first try. 1 hint.")).toBeVisible();
  await child.getByRole("link", { name: "Back to Learn" }).click();
  await expect(child).toHaveURL(at("/child/learn"));
  await expect(child.getByRole("link", { name: /Day 2.*Small buys add up/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(child.getByText("Practised").first()).toBeVisible();
});

test("a locked mission can't be opened", async () => {
  await child.goto("/child/learn/this-or-that");
  await expect(child).toHaveURL(at("/child/learn"));
});

test("a topic page explains, lets the child practise, and leads back to the mission", async () => {
  await child.goto("/child/learn/topics/spending?from=small-buys-add-up");
  await expect(child.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(child.getByRole("link", { name: 'Back to "Small buys add up"' })).toBeVisible();
  await answerAnything(child);
  await check(child);
  // Wrong or right, the final answer can be reached and the page offers the way back.
  if (await child.getByRole("button", { name: "Try again" }).isVisible()) {
    await child.getByRole("button", { name: "Try again" }).click();
    await answerAnything(child);
    await check(child);
  }
  await expect(child.getByRole("button", { name: "Continue", exact: true })).toBeVisible();
});

test("a due review shows up as practice, then nothing is due", async () => {
  if (!local) return;
  const admin = createClient(local.url, local.secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin
    .from("review_items")
    .update({ due_on: "2000-01-01" })
    .eq("child_id", childId);
  expect(error).toBeNull();

  await child.goto("/child");
  await expect(
    child.getByRole("heading", { name: "Practice time. About a minute." }),
  ).toBeVisible();
  await child.getByRole("link", { name: "Practise", exact: true }).click();
  await expect(child).toHaveURL(at("/child/learn/practice"));
  await expect(child.getByText("Question 1 of 1")).toBeVisible();

  // Any answer will do: right or wrong after two tries, the practice set finishes.
  await answerAnything(child);
  await check(child);
  if (await child.getByRole("button", { name: "Try again" }).isVisible()) {
    await child.getByRole("button", { name: "Try again" }).click();
    const labels = await stepCard(child).locator("label").all();
    if (labels[1]) await labels[1].click();
    await check(child);
  }
  await next(child);
  await expect(
    child.getByRole("heading", { name: "Practice done. Nicely kept fresh." }),
  ).toBeVisible();
  await child.goto("/child/learn/practice");
  await expect(child.getByRole("heading", { name: "All caught up." })).toBeVisible();
});

test("the parent sees learning apart from money", async () => {
  await parent.goto(`/parent/children/${childId}`);
  await expect(parent.getByRole("region", { name: "Learning" })).toContainText(
    "1 of 7 missions done.",
  );
  await parent.getByRole("link", { name: "See learning progress" }).click();
  await expect(parent).toHaveURL(at(`/parent/children/${childId}/learning`));
  await expect(parent.getByRole("heading", { name: "Kai's learning" })).toBeVisible();
  await expect(parent.getByText(/Starting check-in: \d of 5 known already\./)).toBeVisible();
  await expect(parent.getByRole("region", { name: "Missions done" })).toContainText(
    "5 of 6 first try. 1 hint.",
  );
  // The parent's path has no links into the child's screens.
  await expect(parent.getByRole("region", { name: "The journey" }).getByRole("link")).toHaveCount(
    0,
  );
});

test("another family's parent can't open this child's learning", async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL;
  const other = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();
  await other.goto("/signup");
  await other.getByLabel("Name", { exact: true }).fill("Other Parent");
  await other.getByLabel("Email", { exact: true }).fill(`e2e-learning-other-${run}@example.com`);
  await other.getByLabel("Password", { exact: true }).fill(password);
  await other.getByRole("button", { name: "Create account" }).click();
  await completeParentProfile(other);
  await other.getByRole("button", { name: "Create family" }).click();
  await expect(other).toHaveURL(at("/parent"));
  await other.goto(`/parent/children/${childId}/learning`);
  await expect(other.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(other.getByText("Kai's learning")).toHaveCount(0);
  await other.context().close();
});
