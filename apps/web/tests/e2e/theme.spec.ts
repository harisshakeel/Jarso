import { expect, test } from "@playwright/test";

test("theme toggle: first visit follows the OS, one click flips it, the choice persists", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);

  // Before any choice is saved, the theme keeps following the OS.
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(html).toHaveClass(/dark/);
  await expect(page.getByRole("menu")).toHaveCount(0);

  await page.reload();
  await expect(html).toHaveClass(/dark/);

  // An explicit choice beats the OS setting.
  await page.emulateMedia({ colorScheme: "light" });
  await expect(html).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(html).not.toHaveClass(/dark/);
});
