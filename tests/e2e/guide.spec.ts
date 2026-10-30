import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/**
 * Jarso (FR07, FR09, ADR 0011) against the LOCAL Supabase stack with the keyword-based fake
 * provider (FEATURE_GUIDE=true, GUIDE_PROVIDER=fake in playwright.config): on by default (the
 * add-child notice and the parent's switch), the intro card in the Ask Jarso window on Home, a
 * look-up of the child's own jars, an answer with topic links and a check, a safety response with
 * helplines, "Help me" in a mission, the parent's flagged-first transcript with what Jarso looked
 * at, and turning it off.
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

/** The Ask Jarso window at the top of the child's Home. */
const jarso = (page: Page) => page.getByRole("region", { name: "Ask Jarso" });

async function askJarso(page: Page, question: string): Promise<void> {
  await jarso(page).getByLabel("Your question for Jarso").fill(question);
  await jarso(page).getByRole("button", { name: "Ask", exact: true }).click();
}

/** The sheet beside a mission step. */
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
  // On by default (ADR 0011): the parent is told before the child exists.
  await expect(parent.getByRole("heading", { name: "Jarso, the AI helper, is on" })).toBeVisible();
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

test("Jarso is on by default, and the parent sees how to turn it off", async () => {
  const toggle = parent.getByRole("switch", { name: "Jarso for Remi" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // The child's page only: Next keeps the add-child page (with its notice) hidden in the DOM.
  const card = parent.getByRole("region", { name: "Jarso, the AI helper", exact: true });
  await expect(card.getByText(/made with Anthropic's Claude/)).toBeVisible();
  await expect(card.getByText(/looks at their own jars, allowance/)).toBeVisible();
  await expect(card.getByText(/on unless you turn it off/)).toBeVisible();
  await expect(child.getByRole("heading", { name: /Five quick questions/ })).toBeVisible();
  await expect(jarso(child)).toBeVisible();
});

test("a first chat starts with the intro, then looks up the child's own jars", async () => {
  const panel = jarso(child);
  await expect(panel.getByText("Jarso is an AI. Your parent can see these chats.")).toBeVisible();
  await expect(panel.getByText("Before we start")).toBeVisible();
  await expect(panel.getByText(/I'm a computer program, not a person/)).toBeVisible();
  await panel.getByRole("button", { name: "Got it" }).click();

  // A suggested question, answered from the child's own (empty) jars.
  await panel.getByRole("button", { name: "How much do I have?" }).click();
  await expect(panel.getByText("You have £0 in Spend and £0 in Save.")).toBeVisible();
  await expect(panel.getByText("Looked at: jars")).toBeVisible();
  await expect(panel.getByText("Jarso AI", { exact: true }).first()).toBeVisible();
});

test("an idea gets an answer with topics and a check", async () => {
  const panel = jarso(child);
  await askJarso(child, "What is saving?");
  await expect(panel.getByText(/Saving means keeping some money for later/)).toBeVisible();
  await expect(panel.getByRole("link", { name: "Saving toward a goal" })).toBeVisible();
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(panel.getByText(/That's it\. A goal counts only what's in Save\./)).toBeVisible();
  const helpful = panel.getByRole("button", { name: "Helpful", exact: true }).last();
  await helpful.click();
  await expect(helpful).toHaveAttribute("aria-pressed", "true");
});

test("a safety message gets a kind fixed reply with helplines, never the model's answer", async () => {
  await askJarso(child, "someone at school hurt me");
  const panel = jarso(child);
  await expect(panel.getByText(/Thank you for telling me/)).toBeVisible();
  await expect(panel.getByRole("link", { name: "Find A Helpline" })).toBeVisible();
  await expect(panel.getByText(/call your local emergency number/)).toBeVisible();
});

test("off-topic questions are redirected to money topics", async () => {
  const panel = jarso(child);
  await panel.getByRole("button", { name: "New chat" }).click();
  await askJarso(child, "can you do my homework");
  await expect(panel.getByText(/I can only help with money/)).toBeVisible();
  // The intro shows only before a child's very first message.
  await child.reload();
  await expect(jarso(child).getByText("Before we start")).toHaveCount(0);
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

test("the parent reads chats flagged first, with what Jarso looked at", async () => {
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
  await expect(transcript.getByText("How much do I have?")).toBeVisible();
  await expect(transcript.getByText("Looked at: jars")).toBeVisible();
});

test("turning Jarso off hides it from the child", async () => {
  await parent.goto(childBase);
  const toggle = parent.getByRole("switch", { name: "Jarso for Remi" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toBeEnabled();
  await child.goto("/child");
  // By now the child has started a mission, so Home leads with "Keep going"; wait on the greeting.
  await expect(child.getByRole("heading", { name: "Hi, Remi!" })).toBeVisible();
  await child.waitForLoadState("networkidle");
  await expect(jarso(child)).toHaveCount(0);
});
