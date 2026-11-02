import { randomInt, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContextOptions, expect, type Page, test } from "@playwright/test";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/**
 * Accessibility at phone width (design.md §11), against the LOCAL Supabase stack. Every public,
 * child and parent page a new family can reach is scanned with axe in the light and the dark
 * theme; any serious or critical WCAG 2 A/AA violation fails the run.
 */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "A11y e2e needs the server playwright.config starts.");
// Each test scans many pages; axe takes a second or two per page.
test.describe.configure({ mode: "serial", timeout: 180_000 });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const PUBLIC_ROUTES = ["/", "/privacy", "/safety", "/start", "/login", "/signup", "/sign-in/child"];
const CHILD_ROUTES = [
  "/child",
  "/child/diary",
  "/child/requests",
  "/child/inbox",
  "/child/settings",
  "/child/learn",
  "/child/learn/check-in",
  "/child/learn/week",
  "/child/learn/practice",
  "/child/learn/whats-in-spend",
];
const parentRoutes = (childBase: string) => [
  "/parent",
  "/parent/inbox",
  "/parent/allowance",
  "/parent/settings",
  "/parent/settings?tab=children",
  "/parent/settings?tab=you",
  "/parent/children/new",
  childBase,
  `${childBase}/allowance`,
  `${childBase}/history`,
  `${childBase}/learning`,
  `${childBase}/rules`,
  `${childBase}/guide`,
  `${childBase}/gifts/new`,
];

let parent: Page;
let child: Page;
let childBase = "";

/** The project's phone emulation; contexts made with browser.newContext() do not inherit it. */
function phone(): BrowserContextOptions {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
    test.info().project.use;
  return {
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    // Motion settles instantly, so axe never measures a half-faded element.
    reducedMotion: "reduce",
    extraHTTPHeaders: { "x-forwarded-for": ip },
  };
}

/** Serious and critical violations on the page as it stands, one readable line each. */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return result.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} → ${v.nodes
          .slice(0, 5)
          .map((n) => n.target.join(" "))
          .join(", ")}`,
    );
}

/** Opens a route in the given theme, waits for streamed content, and scans it. */
async function scan(page: Page, route: string, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
  await page.goto(route);
  await page.waitForLoadState("networkidle").catch(() => {});
  await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*\bdark\b)/);
  expect(new URL(page.url()).pathname, `${route} bounced to sign-in`).not.toMatch(
    /^\/(login|sign-in)/,
  );
  expect.soft(await violations(page), `${route} (${theme})`).toEqual([]);
}

test.beforeAll(async ({ browser }) => {
  parent = await (await browser.newContext(phone())).newPage();
  child = await (await browser.newContext(phone())).newPage();

  await parent.goto("/signup");
  await parent.getByLabel("Name", { exact: true }).fill("Ada Parent");
  await parent.getByLabel("Email", { exact: true }).fill(`e2e-a11y-${run}@example.com`);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"), { timeout: 20_000 });
  await completeParentProfile(parent);
  // Setup is only reachable before the family exists, so it is scanned here, once.
  expect.soft(await violations(parent), "/parent/setup").toEqual([]);
  await parent.getByRole("button", { name: "Create family" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  const code = await readFamilyCode(parent);
  await parent.getByRole("link", { name: "Add a child" }).first().click();
  await parent.getByLabel("Nickname").fill("Noor");
  await parent.getByLabel("PIN", { exact: true }).fill("1357");
  await parent.getByRole("checkbox", { name: "I am this child's parent or guardian" }).click();
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await parent.getByRole("link", { name: "Noor", exact: true }).click();
  await expect(parent).toHaveURL(/\/parent\/children\/[0-9a-f-]+$/);
  childBase = new URL(parent.url()).pathname;

  await child.goto("/sign-in/child");
  const codeField = child.getByLabel("Family code");
  await expect(async () => {
    await codeField.fill(code);
    await expect(codeField).toHaveValue(code.toUpperCase(), { timeout: 1_000 });
  }).toPass();
  await child.getByLabel("Your nickname").fill("Noor");
  await child.getByLabel("Your PIN").fill("1357");
  await child.getByRole("button", { name: "Sign in" }).click();
  await expect(child).toHaveURL(at("/child"));
});

test.afterAll(async () => {
  await parent?.context().close();
  await child?.context().close();
});

for (const theme of THEMES) {
  test(`public pages, signed out (${theme})`, async ({ browser }) => {
    const context = await browser.newContext(phone());
    const page = await context.newPage();
    for (const route of PUBLIC_ROUTES) await scan(page, route, theme);
    await context.close();
  });

  test(`child pages (${theme})`, async () => {
    for (const route of CHILD_ROUTES) await scan(child, route, theme);
  });

  test(`a mission step (${theme})`, async () => {
    await scan(child, "/child/learn/whats-in-spend", theme);
    const start = child.getByRole("button", { name: /^(Start|Continue|Pick up)/ }).first();
    if (await start.isVisible()) {
      await start.click();
      await expect(child.getByRole("progressbar").or(child.locator("h2")).first()).toBeVisible();
      expect.soft(await violations(child), `mission step (${theme})`).toEqual([]);
    }
  });

  test(`parent pages (${theme})`, async () => {
    for (const route of parentRoutes(childBase)) await scan(parent, route, theme);
  });
}
