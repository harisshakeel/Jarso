import { randomInt, randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { expireAccessToken } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/**
 * Both onboarding paths, family isolation, wrong-role redirects and PIN lockout, against the
 * LOCAL Supabase stack (see playwright.config.ts). Every run makes fresh parents and families,
 * and sends a random `x-forwarded-for` so the app's per-IP limits (pin 20/15 min, invite 5/h)
 * start empty each run: no `pnpm db:reset` needed between runs.
 */

test.skip(!loadLocalSupabase(), "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Onboarding e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const NO_MATCH = "Hmm, that didn't match. Check with your parent.";
const LOCKED = "Too many tries. Ask your parent or wait a little while.";
const INVITATION_GONE =
  "This invitation has expired or was already used. Ask your child to start again.";

const run = randomUUID().slice(0, 8);
const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const clientIp = randomIp();
const password = `pw-${randomUUID()}`;
const parentEmail = (who: string) => `e2e-${who}-${run}@example.com`;

/** Exact path match: a regex like /\/child$/ would also accept /sign-in/child. */
const at = (path: string) => (url: URL) => url.pathname === path;

/** Shared across the serial tests below. */
const state = { samFamilyCode: "", miaInviteCode: "" };

/** Each actor gets its own browser context (own cookies), by default from this run's client IP. */
async function newActor(browser: Browser, ip = clientIp): Promise<Page> {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  return context.newPage();
}

async function signUpParent(page: Page, name: string, email: string): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  // Local stack has email confirmation off, so sign-up returns a session straight away.
  await expect(page).toHaveURL(at("/parent/setup"));
}

async function createFamily(page: Page): Promise<string> {
  await expect(page.getByRole("heading", { name: "Set up your family." })).toBeVisible();
  await page.getByRole("button", { name: "Create family" }).click();
  await expect(page).toHaveURL(at("/parent"));
  return readFamilyCode(page);
}

async function readFamilyCode(page: Page): Promise<string> {
  const card = page.locator("[data-slot=card]", { hasText: "Give this code to your child" });
  const code = ((await card.getByText(/^[A-Z2-9]{6}$/).textContent()) ?? "").trim();
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  return code;
}

async function giveConsent(page: Page): Promise<void> {
  const consent = page.getByRole("checkbox", { name: "I am this child's parent or guardian" });
  await consent.click();
  await expect(consent).toBeChecked();
}

async function fillChildSignIn(page: Page, familyCode: string, nickname: string): Promise<void> {
  await page.goto("/sign-in/child");
  const code = page.getByLabel("Family code");
  // The field upper-cases as you type once hydrated; retry so an early fill isn't lost.
  await expect(async () => {
    await code.fill(familyCode);
    await expect(code).toHaveValue(familyCode.toUpperCase(), { timeout: 1_000 });
  }).toPass();
  await page.getByLabel("Your nickname").fill(nickname);
}

async function submitPin(page: Page, pin: string): Promise<void> {
  const field = page.getByLabel("Your PIN");
  await field.fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Typed the way a child might: lower case, with a separator, and trailing spaces. */
const messyCode = (code: string, separator: string) =>
  ` ${code.slice(0, 3)}${separator}${code.slice(3)} `.toLowerCase();

test("parent-started: parent adds Sam, Sam signs in with the family code", async ({ browser }) => {
  const parent = await newActor(browser);
  await signUpParent(parent, "Alex Parent", parentEmail("alex"));
  state.samFamilyCode = await createFamily(parent);

  await parent.getByRole("link", { name: "Add a child" }).click();
  await expect(parent).toHaveURL(at("/parent/children/new"));
  await parent.getByLabel("Nickname").fill("Sam");
  await parent.getByLabel("PIN", { exact: true }).fill("1234");
  await giveConsent(parent);
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await expect(parent.getByRole("listitem").filter({ hasText: "Sam" })).toBeVisible();

  const child = await newActor(browser);
  await fillChildSignIn(child, messyCode(state.samFamilyCode, "-"), "  sAM ");
  await submitPin(child, "1234");
  await expect(child).toHaveURL(at("/child"));
  await expect(child.getByRole("heading", { name: "Hi, Sam!" })).toBeVisible();
});

test("child-started: Mia asks, parent approves with the code, Mia signs in", async ({
  browser,
}) => {
  const child = await newActor(browser);
  await child.goto("/start");
  await child.getByLabel("Your nickname").fill("Mia");
  await child.getByLabel("Your parent's email").fill(parentEmail("blake"));
  await child.getByRole("button", { name: "Ask my parent" }).click();
  await expect(child.getByText("Show this to your parent.")).toBeVisible();
  const shown = child.getByText("Your code").locator("xpath=following-sibling::p[1]");
  state.miaInviteCode = ((await shown.textContent()) ?? "").replace(/\s/g, "");
  expect(state.miaInviteCode).toMatch(/^[A-Z2-9]{8}$/);

  const parent = await newActor(browser);
  await signUpParent(parent, "Blake Parent", parentEmail("blake"));
  const familyCode = await createFamily(parent);

  await parent.goto("/invite");
  await parent.getByLabel("Invite code").fill(state.miaInviteCode.toLowerCase());
  await parent.getByRole("button", { name: "Continue" }).click();
  await expect(parent.getByLabel("Nickname")).toHaveValue("Mia");
  await parent.getByLabel("PIN", { exact: true }).fill("2468");
  await giveConsent(parent);
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await expect(parent.getByRole("listitem").filter({ hasText: "Mia" })).toBeVisible();

  await fillChildSignIn(child, messyCode(familyCode, " "), " MIA");
  await submitPin(child, "2468");
  await expect(child).toHaveURL(at("/child"));
  await expect(child.getByRole("heading", { name: "Hi, Mia!" })).toBeVisible();

  // The code is single-use: opening it again shows the same message as an unknown one.
  await parent.goto(`/invite?code=${state.miaInviteCode}`);
  await expect(parent.getByText(INVITATION_GONE)).toBeVisible();
});

/** A signed-out child asks a parent to join from /start. Returns the invite code shown. */
async function childAsks(page: Page, nickname: string, email: string): Promise<string> {
  await page.goto("/start");
  await page.getByLabel("Your nickname").fill(nickname);
  await page.getByLabel("Your parent's email").fill(email);
  await page.getByRole("button", { name: "Ask my parent" }).click();
  await expect(page.getByText("Show this to your parent.")).toBeVisible();
  const shown = page.getByText("Your code").locator("xpath=following-sibling::p[1]");
  return ((await shown.textContent()) ?? "").replace(/\s/g, "");
}

test("invitations list: parent refreshes, sees Ava's invite and accepts it", async ({
  browser,
}) => {
  const parent = await newActor(browser);
  await signUpParent(parent, "Dana Parent", parentEmail("dana"));
  await createFamily(parent);

  await parent.goto("/invite");
  await expect(parent.getByText("No invitations waiting.", { exact: false })).toBeVisible();

  // Mixed case: matching the parent's email ignores case.
  const child = await newActor(browser);
  await childAsks(child, "Ava", parentEmail("dana").toUpperCase());

  // Someone else's invitation never shows up in Dana's list.
  const ottoCode = await childAsks(await newActor(browser), "Otto", parentEmail("nobody"));

  await parent.getByRole("button", { name: "Refresh invitations" }).click();
  const list = parent.getByRole("region", { name: "Waiting for you" });
  const row = list.getByRole("listitem").filter({ hasText: "Ava" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/^Sent /)).toBeVisible();
  await expect(list.getByText("Otto")).toHaveCount(0);

  await row.getByRole("link", { name: "Accept Ava" }).click();
  await expect(parent).toHaveURL((url) => url.pathname === "/invite" && url.searchParams.has("id"));
  const acceptedId = new URL(parent.url()).searchParams.get("id") ?? "";
  await expect(parent.getByLabel("Nickname")).toHaveValue("Ava");
  await parent.getByLabel("PIN", { exact: true }).fill("1357");
  await giveConsent(parent);
  await parent.getByRole("button", { name: "Add child" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await expect(parent.getByRole("listitem").filter({ hasText: "Ava" })).toBeVisible();

  // Accepted invitations leave the list, and their id no longer opens the form.
  await parent.goto("/invite");
  await expect(parent.getByText("No invitations waiting.", { exact: false })).toBeVisible();
  await parent.goto(`/invite?id=${acceptedId}`);
  await expect(parent.getByText(INVITATION_GONE)).toBeVisible();

  // An id that isn't in this parent's list shows the same message as a used one.
  await parent.goto(`/invite?id=${randomUUID()}`);
  await expect(parent.getByText(INVITATION_GONE)).toBeVisible();

  // Otto's invitation (sent to another parent) is untouched: still pending, opens by its code.
  await parent.goto(`/invite?code=${ottoCode}`);
  await expect(parent.getByLabel("Nickname")).toHaveValue("Otto");
});

test("isolation and roles: other families stay hidden, each role lands on its own home", async ({
  browser,
}) => {
  const stranger = await newActor(browser);
  await signUpParent(stranger, "Casey Parent", parentEmail("casey"));
  await createFamily(stranger);
  await expect(stranger.getByText("Add your first child to get started.")).toBeVisible();
  await expect(stranger.getByText("Sam", { exact: true })).toHaveCount(0);
  await expect(stranger.getByText("Mia", { exact: true })).toHaveCount(0);

  // Parent opening the child area goes back to the parent home.
  await stranger.goto("/child");
  await expect(stranger).toHaveURL(at("/parent"));

  // Child opening the parent area goes back to the child home.
  const sam = await newActor(browser);
  await fillChildSignIn(sam, state.samFamilyCode, "Sam");
  await submitPin(sam, "1234");
  await expect(sam).toHaveURL(at("/child"));
  await sam.goto("/parent");
  await expect(sam).toHaveURL(at("/child"));
  await expect(sam.getByRole("heading", { name: "Hi, Sam!" })).toBeVisible();

  // Signed out, the child area sends you to the PIN sign-in, not the parent login.
  const signedOut = await newActor(browser);
  await signedOut.goto("/child");
  await expect(signedOut).toHaveURL(at("/sign-in/child"));
});

test("lockout: five wrong PINs lock this device out, even the right PIN is refused", async ({
  browser,
}) => {
  const child = await newActor(browser);
  await fillChildSignIn(child, state.samFamilyCode, "Sam");
  const pin = child.getByLabel("Your PIN");

  for (let attempt = 1; attempt <= 5; attempt++) {
    await submitPin(child, "9999");
    // The PIN field clears when the action finishes; the code and nickname stay.
    await expect(pin).toHaveValue("");
    await expect(child.getByText(NO_MATCH)).toBeVisible();
  }

  await submitPin(child, "9999");
  await expect(child.getByText(LOCKED)).toBeVisible();

  await submitPin(child, "1234");
  await expect(pin).toHaveValue("");
  await expect(child.getByText(LOCKED)).toBeVisible();
  await expect(child).toHaveURL(at("/sign-in/child"));
});

test("lockout is per device; a PIN reset unlocks it and signs other devices out", async ({
  browser,
}) => {
  // Another network still works while the first device is locked.
  const tablet = await newActor(browser, randomIp());
  await fillChildSignIn(tablet, state.samFamilyCode, "Sam");
  await submitPin(tablet, "1234");
  await expect(tablet).toHaveURL(at("/child"));

  // Control: before the reset, an expired access token refreshes and the tablet stays in.
  await expireAccessToken(tablet);
  await tablet.reload();
  await expect(tablet.getByRole("heading", { name: "Hi, Sam!" })).toBeVisible();

  const parent = await newActor(browser, randomIp());
  await parent.goto("/login");
  await parent.getByLabel("Email", { exact: true }).fill(parentEmail("alex"));
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Sign in" }).click();
  await expect(parent).toHaveURL(at("/parent"));
  await parent.getByRole("button", { name: "Reset PIN for Sam" }).click();
  await parent.getByLabel("New PIN", { exact: true }).fill("4321");
  await parent.getByRole("button", { name: "Save PIN" }).click();
  await expect(parent.getByText("PIN updated for Sam")).toBeVisible();

  // The reset revoked the tablet's session: once its access token expires, the refresh fails
  // and it is signed out.
  await expireAccessToken(tablet);
  await tablet.reload();
  await expect(tablet).toHaveURL(at("/sign-in/child"));

  // The locked device is unlocked by the reset; the old PIN is gone, the new one works.
  const child = await newActor(browser);
  await fillChildSignIn(child, state.samFamilyCode, "Sam");
  await submitPin(child, "1234");
  await expect(child.getByText(NO_MATCH)).toBeVisible();
  await submitPin(child, "4321");
  await expect(child).toHaveURL(at("/child"));
});
