import { randomInt, randomUUID } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  addChild as addChildAccount,
  createParentUser,
  dueOccurrence as dueOccurrenceFor,
  E2E_CRON_SECRET,
  signedInClient,
  waitForHydration,
} from "./helpers";
import { assertLocalUrl, loadLocalSupabase } from "./local-supabase";

/**
 * Card handover with the fake payment provider (PAYMENTS_ALLOW_FAKE=true in playwright.config.ts)
 * against LOCAL Supabase. Families are built through the API; the card journeys run in the
 * browser through the fake hosted checkout at /dev/payments/fake.
 */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Payments e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const AMOUNT = 500;

let admin: SupabaseClient;
const familyIds: string[] = [];
const authUserIds: string[] = [];

type Parent = { page: Page; client: SupabaseClient; familyId: string };

/** A parent with a finished profile and a family, signed in both in the browser and through the API. */
async function newParent(browser: Browser, tag: string): Promise<Parent> {
  if (!local) throw new Error("unreachable");
  const email = `e2e-payments-${tag}-${run}@example.com`;
  const password = `pw-${randomUUID()}`;
  authUserIds.push(await createParentUser(admin, email, password));
  const client = await signedInClient(local, email, password);
  const { error: profileError } = await client.rpc("complete_parent_profile", {
    p_date_of_birth: "1985-06-15",
    p_country: "GB",
    p_gender: "prefer_not_to_say",
  });
  if (profileError) throw new Error(`Profile failed: ${profileError.message}`);
  const { data: familyId, error: familyError } = await client.rpc("create_family", {
    p_currency: "GBP",
    p_timezone: "UTC",
  });
  if (familyError) throw new Error(`create_family failed: ${familyError.message}`);
  familyIds.push(familyId as string);

  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    extraHTTPHeaders: { "x-forwarded-for": ip },
  });
  const page = await context.newPage();
  await page.goto("/login");
  await waitForHydration(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/parent");
  return { page, client, familyId: familyId as string };
}

async function addChild(parent: Parent, nickname: string): Promise<string> {
  const id = await addChildAccount(admin, parent.client, {
    familyId: parent.familyId,
    nickname,
    email: `e2e-payments-child-${nickname.toLowerCase()}-${run}@example.com`,
  });
  authUserIds.push(id);
  return id;
}

const dueOccurrence = (parent: Parent, childId: string) =>
  dueOccurrenceFor(admin, parent.client, childId, AMOUNT);

/** Spend + Save, recorded, in minor units, read as the parent. */
async function jars(parent: Parent, childId: string): Promise<number> {
  let total = 0;
  for (const jar of ["spend", "save"]) {
    const { data, error } = await parent.client.rpc("balance", {
      p_child_id: childId,
      p_jar: jar,
    });
    if (error) throw new Error(`balance failed: ${error.message}`);
    total += Number(data);
  }
  return total;
}

async function occurrenceStatus(id: string): Promise<string> {
  const { data, error } = await admin
    .from("allowance_occurrences")
    .select("status")
    .eq("id", id)
    .single();
  if (error) throw new Error(`Occurrence read failed: ${error.message}`);
  return data.status;
}

// A developer's env may turn Stripe on beside the fake: then the buttons name their provider.
const PAY_WITH_FAKE = /^(Pay by card|Pay with Test card)$/;
const SAVE_WITH_FAKE = /^(Save a card|Save with Test card)$/;

const handoverPath = (childId: string, id: string) =>
  `/parent/children/${childId}/handover/allowance/${id}`;
const onFakeCheckout = (url: URL) => url.pathname === "/dev/payments/fake";

/** Turns auto charge on for the child's allowance, saving the given fake card on the way. */
async function turnOnAutoCharge(
  parent: Parent,
  childId: string,
  card: "Save card that works" | "Save card that declines",
) {
  const { page } = parent;
  await page.goto(`/parent/children/${childId}/allowance`);
  const toggle = page.getByRole("switch", { name: "Auto charge" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await page.getByRole("button", { name: SAVE_WITH_FAKE }).click();
  await expect(page).toHaveURL(onFakeCheckout);
  await page.getByRole("button", { name: card }).click();
  await expect(page).toHaveURL((url) => url.pathname === `/parent/children/${childId}/allowance`);
  await expect(page.getByRole("switch", { name: "Auto charge" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
}

async function runCron(page: Page) {
  const res = await page.request.post("/api/cron/payments/auto-charge", {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
  return (await res.json()).data as {
    attempted: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
}

let payer: Parent;
let decliner: Parent;

test.beforeAll(async ({ browser }) => {
  if (!local) return;
  assertLocalUrl(local.url);
  admin = createClient(local.url, local.secretKey, options);
  payer = await newParent(browser, "payer");
  decliner = await newParent(browser, "decliner");
});

test.afterAll(async () => {
  await payer?.page.context().close();
  await decliner?.page.context().close();
  if (!admin) return;
  for (const id of familyIds) await admin.from("families").delete().eq("id", id);
  for (const id of authUserIds) await admin.auth.admin.deleteUser(id);
});

test("pay by card on the handover screen fills the jars", async () => {
  const { page } = payer;
  const childId = await addChild(payer, "Mia");
  const id = await dueOccurrence(payer, childId);
  const before = await jars(payer, childId);

  await page.goto(handoverPath(childId, id));
  await page.getByRole("button", { name: PAY_WITH_FAKE }).click();
  await expect(page).toHaveURL(onFakeCheckout);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === handoverPath(childId, id));
  await expect(page.getByText("Payment received")).toBeVisible();

  await page.reload();
  expect(await jars(payer, childId)).toBe(before + AMOUNT);
  expect(await occurrenceStatus(id)).toBe("confirmed");
  await page.goto(`/parent/children/${childId}/history`);
  await expect(page.getByText(/Paid by card/)).toBeVisible();
});

test("backing out of the checkout cancels it, so the item isn't left in progress", async () => {
  const { page } = payer;
  const childId = await addChild(payer, "Lena");
  const id = await dueOccurrence(payer, childId);

  await page.goto(handoverPath(childId, id));
  await page.getByRole("button", { name: PAY_WITH_FAKE }).click();
  await expect(page).toHaveURL(onFakeCheckout);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  // Back on the handover screen; the cancel runs, then ?card is dropped from the URL.
  await expect(page).toHaveURL(
    (url) => url.pathname === handoverPath(childId, id) && !url.searchParams.has("card"),
  );
  await expect
    .poll(async () => {
      const { data } = await admin
        .from("payments")
        .select("status")
        .eq("source_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data?.status;
    })
    .toBe("canceled");
  await expect(page.getByText("Card payment in progress")).toHaveCount(0);
  await expect(page.getByRole("button", { name: PAY_WITH_FAKE })).toBeEnabled();
  expect(await occurrenceStatus(id)).toBe("due");
});

test("a card payment finished after a cash handover posts nothing and says so", async () => {
  const { page } = payer;
  const childId = await addChild(payer, "Noor");
  const id = await dueOccurrence(payer, childId);
  const before = await jars(payer, childId);

  await page.goto(handoverPath(childId, id));
  await page.getByRole("button", { name: PAY_WITH_FAKE }).click();
  await expect(page).toHaveURL(onFakeCheckout);
  const checkout = page.url();

  await page.goto(handoverPath(childId, id));
  await expect(page.getByText("Card payment in progress")).toBeVisible();
  await page.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(page).toHaveURL((url) => url.pathname === `/parent/children/${childId}`);

  await page.goto(checkout);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === handoverPath(childId, id));
  await expect(
    page.getByText(
      "Paid by card after it was already handed over. Refund it from the provider's dashboard.",
    ),
  ).toBeVisible();
  expect(await jars(payer, childId)).toBe(before + AMOUNT);
});

test("auto charge pays a due allowance with the saved card", async () => {
  const childId = await addChild(payer, "Ollie");
  const id = await dueOccurrence(payer, childId);
  const before = await jars(payer, childId);

  await turnOnAutoCharge(payer, childId, "Save card that works");
  const result = await runCron(payer.page);
  expect(result.succeeded).toBeGreaterThanOrEqual(1);

  expect(await occurrenceStatus(id)).toBe("confirmed");
  expect(await jars(payer, childId)).toBe(before + AMOUNT);
});

test("a declined auto charge tells the parent and leaves the allowance due", async () => {
  const { page } = decliner;
  const childId = await addChild(decliner, "Pip");
  const id = await dueOccurrence(decliner, childId);
  const before = await jars(decliner, childId);

  await turnOnAutoCharge(decliner, childId, "Save card that declines");
  const result = await runCron(page);
  expect(result.failed).toBeGreaterThanOrEqual(1);

  await page.goto("/parent/inbox");
  await expect(page.getByText("Card payment for Pip's allowance didn't go through")).toBeVisible();
  expect(await occurrenceStatus(id)).toBe("due");
  expect(await jars(decliner, childId)).toBe(before);
});
