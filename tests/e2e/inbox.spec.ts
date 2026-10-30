import { randomInt, randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { completeParentProfile, readFamilyCode } from "./helpers";
import { loadLocalSupabase } from "./local-supabase";

/** Inbox pages and the unread badge, against the LOCAL Supabase stack (see playwright.config.ts). */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.skip(!!process.env.E2E_BASE_URL, "Inbox e2e needs the server playwright.config starts.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const at = (path: string) => (url: URL) => url.pathname === path;

let parent: Page;
let child: Page;
let childBase = "";

const parentInboxTab = () =>
  parent.getByRole("navigation", { name: "Parent" }).getByRole("link", { name: /Inbox/ });
const childInboxTab = () =>
  child.getByRole("navigation", { name: "Child" }).getByRole("link", { name: /Inbox/ });

test.beforeAll(async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL;
  parent = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();
  child = await (
    await browser.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": ip } })
  ).newPage();

  await parent.goto("/signup");
  await parent.getByLabel("Name", { exact: true }).fill("Alex Parent");
  await parent.getByLabel("Email", { exact: true }).fill(`e2e-inbox-${run}@example.com`);
  await parent.getByLabel("Password", { exact: true }).fill(password);
  await parent.getByRole("button", { name: "Create account" }).click();
  await expect(parent).toHaveURL(at("/parent/setup"));
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

  await child.goto("/sign-in/child");
  const codeField = child.getByLabel("Family code");
  await expect(async () => {
    await codeField.fill(code);
    await expect(codeField).toHaveValue(code.toUpperCase(), { timeout: 1_000 });
  }).toPass();
  await child.getByLabel("Your nickname").fill("Sam");
  await child.getByLabel("Your PIN").fill("1234");
  await child.getByRole("button", { name: "Sign in" }).click();
  await expect(child).toHaveURL(at("/child"));
});

test.afterAll(async () => {
  await parent.context().close();
  await child.context().close();
});

test("a due allowance sends a reminder to the parent and the child", async () => {
  await parent.goto(`${childBase}/allowance`);
  await parent.getByLabel("Amount").fill("5");
  await parent.getByRole("group").getByText("Weekly", { exact: true }).click();
  await parent.getByRole("button", { name: "Save allowance" }).click();
  await expect(parent).toHaveURL(at(childBase));

  // The cron job runs hourly; here the service role runs it now.
  const admin = createClient(local?.url ?? "", local?.secretKey ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.rpc("send_handover_reminders");
  expect(error).toBeNull();

  await parent.goto("/parent");
  await expect(parentInboxTab()).toContainText("1");
  await child.goto("/child");
  await expect(childInboxTab()).toContainText("1");
});

test("child sees the notice in the Inbox", async () => {
  await childInboxTab().click();
  await expect(child).toHaveURL(at("/child/inbox"));
  await expect(child.getByText(/Your US\$5(\.00)? allowance is due/)).toBeVisible();
  await expect(child.getByText("Your parent will hand it over.")).toBeVisible();
});

test("parent opens the notice, lands on the handover screen and the badge goes", async () => {
  await parentInboxTab().click();
  await expect(parent).toHaveURL(at("/parent/inbox"));
  await parent.getByRole("link", { name: /Sam's US\$5(\.00)? allowance is due/ }).click();
  await expect(parent).toHaveURL(new RegExp(`${childBase}/handover/allowance/[0-9a-f-]+$`));
  await expect(parent.getByRole("heading", { name: "Hand over to Sam" })).toBeVisible();
  await expect(parentInboxTab()).not.toContainText("1");
});

test("after the handover the notice opens to the handed-over state", async () => {
  await parent.getByRole("button", { name: "Confirm I handed it over" }).click();
  await expect(parent).toHaveURL(at(childBase));
  await parentInboxTab().click();
  await parent.getByRole("link", { name: /Sam's US\$5(\.00)? allowance is due/ }).click();
  await expect(parent.getByText("Already handled")).toBeVisible();
});

test("Show more pages through a long inbox with no repeats and no gaps", async () => {
  const admin = createClient(local?.url ?? "", local?.secretKey ?? "", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // This run's parent, and the family and child on the allowance notice already in their inbox.
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  expect(usersError).toBeNull();
  const owner = users?.users.find((user) => user.email === `e2e-inbox-${run}@example.com`);
  expect(owner).toBeTruthy();
  const { data: existing, error: readError } = await admin
    .from("notifications")
    .select("family_id, child_id")
    .eq("recipient_id", owner?.id ?? "")
    .eq("kind", "allowance_due")
    .limit(1)
    .single();
  expect(readError).toBeNull();
  const recipient_id = owner?.id;
  const { family_id, child_id } = existing ?? {};

  // 22 limit notices at 11 distinct times: every created_at is shared by two rows, and the
  // 20-row page ends in the middle of a pair, which is what a cursor on created_at alone gets wrong.
  const base = Date.parse("2026-01-01T09:00:00Z");
  const seeded = Array.from({ length: 22 }, (_, i) => ({
    family_id,
    recipient_id,
    child_id,
    kind: "limit_exceeded",
    source_type: "ledger_entry",
    source_id: randomUUID(),
    window_key: `e2e-page-${run}-${i}`,
    payload: { amount_minor: 100_000 + i * 7, limit_minor: 500 },
    created_at: new Date(base + Math.floor(i / 2) * 60_000).toISOString(),
  }));
  const { error: insertError } = await admin.from("notifications").insert(seeded);
  expect(insertError).toBeNull();
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", recipient_id ?? "");

  const rows = async () => {
    await expect(parent.getByRole("heading", { name: "Inbox" })).toBeVisible();
    return parent.getByRole("listitem").filter({ hasText: "Sam" }).allInnerTexts();
  };

  await parent.goto("/parent/inbox");
  const first = await rows();
  expect(first).toHaveLength(20);
  await parent.getByRole("link", { name: "Show more" }).click();
  await expect(parent).toHaveURL(/\/parent\/inbox\?before=/);
  await expect(parent.getByRole("link", { name: "Show more" })).toHaveCount(0);
  const second = await rows();

  const all = [...first, ...second];
  expect(new Set(all).size).toBe(all.length);
  expect(all).toHaveLength(count ?? -1);
  // Each seeded notice has a distinct amount, so each one must appear exactly once.
  const spent = all.filter((text) => text.includes("went over a spending limit"));
  expect(spent).toHaveLength(22);
});
