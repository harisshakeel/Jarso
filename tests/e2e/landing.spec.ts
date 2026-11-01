import { expect, test } from "@playwright/test";

// The landing page (spec 2026-10-30-landing-page-design). Static: no Supabase needed.

test("navbar: one Get started button holds every way in", async ({ page }) => {
  for (const [item, url] of [
    ["Log in", /\/login$/],
    ["Set up your family", /\/signup$/],
    ["Sign in", /\/sign-in\/child$/],
    ["Start here", /\/start$/],
  ] as const) {
    await page.goto("/");
    await page.getByRole("banner").getByRole("button", { name: "Get started" }).click();
    await page.getByRole("menu").getByRole("menuitem", { name: item, exact: true }).click();
    await expect(page).toHaveURL(url);
  }
});

test("hero: the headline and both ways in", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Got money, but not sure how to manage it?" }),
  ).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Set up your family" }).first()).toHaveAttribute(
    "href",
    "/signup",
  );
  await main.getByRole("link", { name: "I'm a kid" }).click();
  await expect(page).toHaveURL(/\/sign-in\/child$/);
});

test("reduced motion: one still screen with every tagline and caption", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const lines = page.getByRole("list", { name: "What the animation shows" }).getByRole("listitem");
  await expect(lines).toHaveText([
    "Spend some.",
    "Save some.",
    "Learn as you go.",
    "Split it. Spend and Save.",
    "Save for something real.",
    "Again next week. A bit wiser.",
  ]);
  for (const line of await lines.all()) await expect(line).toBeVisible();
  // No tall pinned section: the next section starts within the first two screens.
  const howTop = await page.locator("#how").evaluate((el) => el.getBoundingClientRect().top);
  expect(howTop).toBeLessThan(2 * (page.viewportSize()?.height ?? 720));
});

test("no sideways scroll on a 360 px phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("the safety link opens the AI safety page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How Jarso's AI stays safe" }).click();
  await expect(page).toHaveURL(/\/safety$/);
});

test("the footer's privacy link opens the privacy notice", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Footer" })
    .getByRole("link", { name: "Privacy" })
    .click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy notice" })).toBeVisible();
});
