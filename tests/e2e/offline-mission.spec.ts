import { randomInt, randomUUID } from "node:crypto";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** A mission started online and finished offline, sent in order on reconnect (LOCAL Supabase). */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Offline e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let parent: Page;
let child: Page;
let childContext: BrowserContext;

async function check(): Promise<void> {
  await child.getByRole("button", { name: "Check", exact: true }).click();
  await expect(child.getByRole("heading", { name: "That's it." })).toBeVisible();
}

async function next(): Promise<void> {
  await child.getByRole("button", { name: "Continue", exact: true }).click();
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
  childContext = await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } });
  child = await childContext.newPage();

  await parent.goto("/signup");
  await parent.getByLabel("Name", { exact: true }).fill("Jo Parent");
  await parent.getByLabel("Email", { exact: true }).fill(`e2e-offline-mission-${run}@example.com`);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"));
  await completeParentProfile(parent);
  await parent.getByRole("button", { name: "Create family" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  const code = await readFamilyCode(parent);
  await parent.getByRole("link", { name: "Add a child" }).first().click();
  await parent.getByLabel("Nickname").fill("Ash");
  await parent.getByLabel("PIN", { exact: true }).fill("1357");
  await parent.getByRole("checkbox", { name: "I am this child's parent or guardian" }).click();
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));

  await child.goto("/sign-in/child");
  const codeField = child.getByLabel("Family code");
  await expect(async () => {
    await codeField.fill(code);
    await expect(codeField).toHaveValue(code.toUpperCase(), { timeout: 1_000 });
  }).toPass();
  await child.getByLabel("Your nickname").fill("Ash");
  await child.getByLabel("Your PIN").fill("1357");
  await child.getByRole("button", { name: "Sign in" }).click();
  await expect(child).toHaveURL(at("/child"));
});

test.afterAll(async () => {
  await parent?.context().close();
  await childContext?.close();
});

test("finish a started mission offline, results arrive in order after reconnect", async () => {
  const sent: string[] = [];
  child.on("request", (request) => {
    if (request.method() !== "POST" || !request.url().endsWith("/api/v1/outbox")) return;
    sent.push((request.postDataJSON() as { kind: string }).kind);
  });

  await child.goto("/child/learn/whats-in-spend");
  await child.getByRole("button", { name: "Start mission" }).click();
  await expect(child.getByRole("heading", { name: "Spend is the cash you hold" })).toBeVisible();

  // The connection drops once the mission has started: every answer is kept on the device.
  await childContext.setOffline(true);
  await next();

  await child.getByText("A comic for £6.50").click();
  await check();
  await next();
  await expect(child.getByText("Saved on this device.")).toBeVisible();

  await child.getByRole("textbox", { name: "Your answer" }).fill("6");
  await check();
  await next();

  await child.getByText("No, not enough left").click();
  await child.getByRole("button", { name: "Check", exact: true }).click();
  await expect(child.getByText(/Each buy changes what's left/)).toBeVisible();
  await next();

  const sortStep = child
    .locator("section")
    .filter({ has: child.locator("h2") })
    .first();
  for (const [item, bucket] of [
    ["Pen, £2.50", "Can buy"],
    ["Board game, £18", "Not yet"],
    ["Cinema ticket, £9", "Can buy"],
    ["Trainers, £45", "Not yet"],
    ["Book, £10", "Can buy"],
  ] as const) {
    await sortStep.getByRole("group", { name: item }).getByText(bucket, { exact: true }).click();
  }
  await check();
  await next();

  await child.getByRole("textbox", { name: "Your answer" }).fill("4");
  await check();
  await next();

  await child.getByText("So you know you can pay and what will be left").click();
  await check();
  await next();

  // Every step right first time: no replay, and the finish screen is built on the device.
  await expect(child.getByRole("heading", { name: "Mission done. Nice work." })).toBeVisible();
  await expect(child.getByText("6 of 6 first try. No hints.")).toBeVisible();
  await expect(child.getByText("Saved on this device.")).toBeVisible();
  expect(sent).toEqual([]);

  await childContext.setOffline(false);
  await expect(child.getByText("Saved on this device.")).toHaveCount(0, { timeout: 15_000 });
  expect(sent).toEqual([...Array(6).fill("step"), "completeMission"]);

  await child.getByRole("link", { name: "Back to Learn" }).click();
  await expect(child).toHaveURL(at("/child/learn"));
  await expect(child.getByRole("link", { name: /Day 2.*Small buys add up/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(child.getByText("Practised").first()).toBeVisible();
});
