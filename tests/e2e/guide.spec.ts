import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/**
 * The AI money guide (FR07, FR09) against the LOCAL Supabase stack with the keyword-based fake
 * provider (FEATURE_GUIDE=true, GUIDE_PROVIDER=fake in playwright.config): off by default, the
 * parent's switch, the intro card, an answer with topic links and a check, a safety response
 * with helplines, "Help me" in a mission, and the parent's flagged-first transcript.
 */

test.skip(!loadLocalSupabase(), "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Guide e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let parent: Page;
let child: Page;
let childBase = "";

async function ask(page: Page, question: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Your question").fill(question);
  await dialog.getByRole("button", { name: "Send" }).click();
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
  await parent.getByLabel("Name", { exact: true }).fill("Morgan Parent");
  await parent.getByLabel("Email", { exact: true }).fill(`e2e-guide-${run}@example.com`);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"));
  await completeParentProfile(parent);
  await parent.getByRole("button", { name: "Create family" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  const code = await readFamilyCode(parent);
  await parent.getByRole("link", { name: "Add a child" }).first().click();
  await parent.getByLabel("Nickname").fill("Remi");
  await parent.getByLabel("PIN", { exact: true }).fill("1357");
  await parent.getByRole("checkbox", { name: "I am this child's parent or guardian" }).click();
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await parent.getByRole("link", { name: "Remi", exact: true }).click();
  await expect(parent).toHaveURL(/\/parent\/children\/[0-9a-f-]+$/);
  childBase = new URL(parent.url()).pathname;

  await child.goto("/sign-in/child");
  const codeField = child.getByLabel("Family code");
  await expect(async () => {
    await codeField.fill(code);
    await expect(codeField).toHaveValue(code.toUpperCase(), { timeout: 1_000 });
  }).toPass();
  await child.getByLabel("Your nickname").fill("Remi");
  await child.getByLabel("Your PIN").fill("1357");
  await child.getByRole("button", { name: "Sign in" }).click();
  await expect(child).toHaveURL(at("/child"));
});

test.afterAll(async () => {
  await parent?.context().close();
  await child?.context().close();
});

test("the guide is off until the parent turns it on", async () => {
  await expect(child.getByRole("heading", { name: /Five quick questions/ })).toBeVisible();
  // Every streamed section has arrived before checking that the guide button is absent.
  await child.waitForLoadState("networkidle");
  await expect(child.getByRole("button", { name: "Ask the money guide" })).toHaveCount(0);

  const toggle = parent.getByRole("switch", { name: "Money guide for Remi" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(parent.getByText(/made by Anthropic/)).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // The switch is disabled until the save finishes; only then is it safe to reload.
  await expect(toggle).toBeEnabled();
  await parent.reload();
  await expect(parent.getByRole("switch", { name: "Money guide for Remi" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("a first chat starts with the intro, then answers with topics and a check", async () => {
  await child.reload();
  await child.getByRole("button", { name: "Ask the money guide" }).click();
  const dialog = child.getByRole("dialog");
  await expect(dialog.getByText("AI guide. Your parent can see these chats.")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Before we start" })).toBeVisible();
  await expect(dialog.getByText(/I'm a computer program, not a person/)).toBeVisible();
  await dialog.getByRole("button", { name: "Got it" }).click();

  await ask(child, "What is saving?");
  await expect(dialog.getByText(/Saving means keeping some money for later/)).toBeVisible();
  await expect(dialog.getByText("AI guide", { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Saving toward a goal" })).toBeVisible();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByText(/That's it\. A goal counts only what's in Save\./)).toBeVisible();
  await dialog.getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Helpful", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a safety message gets a kind fixed reply with helplines, never the model's answer", async () => {
  await ask(child, "someone at school hurt me");
  const dialog = child.getByRole("dialog");
  await expect(dialog.getByText(/Thank you for telling me/)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Find A Helpline" })).toBeVisible();
  await expect(dialog.getByText(/call your local emergency number/)).toBeVisible();
  await child.keyboard.press("Escape");
});

test("off-topic questions are redirected to money topics", async () => {
  await child.getByRole("button", { name: "Ask the money guide" }).click();
  // The intro shows only before a child's very first message.
  await expect(
    child.getByRole("dialog").getByRole("heading", { name: "Before we start" }),
  ).toHaveCount(0);
  await ask(child, "can you do my homework");
  await expect(child.getByRole("dialog").getByText(/I can only help with money/)).toBeVisible();
  await child.keyboard.press("Escape");
});

test("Help me in a mission gives a hint, not the answer", async () => {
  await child.goto("/child/learn/whats-in-spend");
  await child.getByRole("button", { name: "Start mission" }).click();
  await child.getByRole("button", { name: "Continue", exact: true }).click();
  await child.getByRole("button", { name: "Help me" }).click();
  await ask(child, "I don't get it");
  await expect(
    child.getByRole("dialog").getByText(/Let's think it through together/),
  ).toBeVisible();
  await child.keyboard.press("Escape");
});

test("the parent reads chats flagged first, without the private safety message", async () => {
  await parent.goto(childBase);
  await expect(parent.getByText("1 chat needs a look.")).toBeVisible();
  await parent.getByRole("link", { name: "Read Remi's chats" }).click();
  await expect(parent).toHaveURL(at(`${childBase}/guide`));
  const chats = parent.getByRole("list", { name: "Chats" }).getByRole("link");
  await expect(chats).toHaveCount(3);
  await expect(chats.first()).toContainText("Needs a look");
  await chats.first().click();
  await expect(parent).toHaveURL(new RegExp(`${childBase}/guide/[0-9a-f-]+$`));
  const transcript = parent.getByRole("list", { name: "Chat" });
  await expect(
    transcript.getByText("A safety response was shown. The message itself is not kept."),
  ).toBeVisible();
  await expect(transcript.getByText("someone at school hurt me")).toHaveCount(0);
  await expect(transcript.getByText("What is saving?")).toBeVisible();
  await expect(transcript.getByText("Your child found this helpful")).toBeVisible();
});

test("turning the guide off hides it from the child", async () => {
  await parent.goto(childBase);
  const toggle = parent.getByRole("switch", { name: "Money guide for Remi" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toBeEnabled();
  await child.goto("/child");
  await expect(child.getByRole("heading", { name: /Five quick questions/ })).toBeVisible();
  await child.waitForLoadState("networkidle");
  await expect(child.getByRole("button", { name: "Ask the money guide" })).toHaveCount(0);
});
