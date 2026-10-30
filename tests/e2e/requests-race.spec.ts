import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertLocalUrl, loadLocalSupabase } from "./local-supabase";

/**
 * Savings requests post exactly once under concurrent calls. No browser: separate HTTP requests
 * from signed-in supabase-js clients hit the RPCs at the same time against LOCAL Supabase.
 */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const options = { auth: { autoRefreshToken: false, persistSession: false } };

let admin: SupabaseClient;
let familyId = "";
const childIds: string[] = [];
const childEmails: string[] = [];
const authUserIds: string[] = [];

const parentEmail = `e2e-reqrace-${run}@example.com`;

async function signedIn(email: string): Promise<SupabaseClient> {
  if (!local) throw new Error("unreachable");
  const client = createClient(local.url, local.publishableKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed: ${error.message}`);
  return client;
}

const parentClient = () => signedIn(parentEmail);

function childClient(i: number): Promise<SupabaseClient> {
  const email = childEmails[i];
  if (!email) throw new Error(`Child ${i} was not set up.`);
  return signedIn(email);
}

/** Signs in `n` separate clients up front, so the race calls themselves start together. */
function many(n: number, make: () => Promise<SupabaseClient>): Promise<SupabaseClient[]> {
  return Promise.all(Array.from({ length: n }, make));
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data as T;
}

function childAt(i: number): string {
  const id = childIds[i];
  if (!id) throw new Error(`Child ${i} was not set up.`);
  return id;
}

function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

async function addChild(parent: SupabaseClient, nickname: string): Promise<void> {
  const email = `e2e-reqrace-child-${nickname}-${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { jarso_role: "child" },
  });
  if (error) throw new Error(`Child creation failed: ${error.message}`);
  authUserIds.push(data.user.id);
  await rpc(parent, "register_child", {
    p_child_id: data.user.id,
    p_family_id: familyId,
    p_nickname: nickname,
    p_pin: "1234",
    p_consent: true,
  });
  childIds.push(data.user.id);
  childEmails.push(email);
}

/** Puts money in a child's jars through a handed-over gift. */
async function fund(childId: string, cash: number, saved: number): Promise<void> {
  const parent = await parentClient();
  const today = new Date().toISOString().slice(0, 10);
  const gift = await rpc<string>(parent, "create_gift", {
    p_child_id: childId,
    p_amount_minor: cash + saved,
    p_give_on: today,
    p_note: "",
    p_idempotency_key: randomUUID(),
  });
  const status = await rpc<string>(parent, "confirm_gift_handover", {
    p_gift_id: gift,
    p_cash_minor: cash,
    p_saved_minor: saved,
    p_idempotency_key: randomUUID(),
  });
  expect(status).toBe("confirmed");
}

async function insertRequest(
  childId: string,
  kind: "withdrawal" | "deposit",
  status: string,
  amount: number,
): Promise<string> {
  const { data, error } = await admin
    .from("requests")
    .insert({
      family_id: familyId,
      child_id: childId,
      kind,
      status,
      amount_minor: amount,
      idempotency_key: randomUUID(),
    })
    .select("id")
    .single();
  if (error) throw new Error(`Request insert failed: ${error.message}`);
  return data.id;
}

async function ledgerCount(sourceId: string): Promise<number> {
  const { count, error } = await admin
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  if (error) throw new Error(`Ledger count failed: ${error.message}`);
  return count ?? 0;
}

async function statusOf(requestId: string): Promise<string> {
  const { data, error } = await admin
    .from("requests")
    .select("status")
    .eq("id", requestId)
    .single();
  if (error) throw new Error(`Status lookup failed: ${error.message}`);
  return data.status;
}

test.beforeAll(async () => {
  if (!local) return;
  assertLocalUrl(local.url);
  admin = createClient(local.url, local.secretKey, options);
  const { data, error } = await admin.auth.admin.createUser({
    email: parentEmail,
    password,
    email_confirm: true,
    app_metadata: { jarso_role: "parent" },
  });
  if (error) throw new Error(`Parent creation failed: ${error.message}`);
  authUserIds.push(data.user.id);

  const parent = await parentClient();
  familyId = await rpc<string>(parent, "create_family", { p_currency: "GBP", p_timezone: "UTC" });
  for (const name of ["ReqA", "ReqB", "ReqC", "ReqD", "ReqE"]) await addChild(parent, name);
});

test.afterAll(async () => {
  if (!admin) return;
  if (familyId) await admin.from("families").delete().eq("id", familyId);
  for (const id of authUserIds) await admin.auth.admin.deleteUser(id);
});

test("five concurrent complete_request calls hand over a withdrawal once", async () => {
  const child = childAt(0);
  await fund(child, 0, 1000);
  const id = await insertRequest(child, "withdrawal", "approved", 300);
  const clients = await many(5, parentClient);
  const results = await Promise.all(
    clients.map((c) =>
      rpc<string>(c, "complete_request", { p_request_id: id, p_idempotency_key: randomUUID() }),
    ),
  );
  expect(tally(results)).toEqual({ completed: 1, already_completed: 4 });
  expect(await statusOf(id)).toBe("handed_over");
  expect(await ledgerCount(id)).toBe(2);
});

test("two parents approving in parallel never approve beyond Save", async () => {
  // Pending requests are reserved, so create_withdrawal never lets 600 + 600 sit against 1000.
  // Forced in through the admin client, neither fits: both stay pending, none over-approved.
  const child = childAt(1);
  await fund(child, 0, 1000);
  const first = await insertRequest(child, "withdrawal", "pending", 600);
  const second = await insertRequest(child, "withdrawal", "pending", 600);
  const [a, b] = await many(2, parentClient);
  if (!a || !b) throw new Error("unreachable");
  const results = await Promise.all([
    rpc<string>(a, "decide_withdrawal", { p_request_id: first, p_approve: true, p_note: "" }),
    rpc<string>(b, "decide_withdrawal", { p_request_id: second, p_approve: true, p_note: "" }),
  ]);
  expect(tally(results)).toEqual({ over_available: 2 });
  expect([await statusOf(first), await statusOf(second)]).toEqual(["pending", "pending"]);
});

test("parallel approvals and hand-overs of two covered withdrawals post each once", async () => {
  const child = childAt(4);
  await fund(child, 0, 1200);
  const first = await insertRequest(child, "withdrawal", "pending", 600);
  const second = await insertRequest(child, "withdrawal", "pending", 600);
  const [a, b] = await many(2, parentClient);
  if (!a || !b) throw new Error("unreachable");
  const approved = await Promise.all([
    rpc<string>(a, "decide_withdrawal", { p_request_id: first, p_approve: true, p_note: "" }),
    rpc<string>(b, "decide_withdrawal", { p_request_id: second, p_approve: true, p_note: "" }),
  ]);
  expect(tally(approved)).toEqual({ approved: 2 });
  const done = await Promise.all([
    rpc<string>(a, "complete_request", { p_request_id: first, p_idempotency_key: randomUUID() }),
    rpc<string>(b, "complete_request", { p_request_id: second, p_idempotency_key: randomUUID() }),
  ]);
  expect(tally(done)).toEqual({ completed: 2 });
  expect(await ledgerCount(first)).toBe(2);
  expect(await ledgerCount(second)).toBe(2);
});

test("five concurrent create_withdrawal calls with one key make one request", async () => {
  const child = childAt(2);
  await fund(child, 0, 1000);
  const key = `race-${randomUUID()}`;
  const clients = await many(5, () => childClient(2));
  const results = await Promise.all(
    clients.map((c) =>
      rpc<{ request_id: string }>(c, "create_withdrawal", {
        p_child_id: child,
        p_amount_minor: 100,
        p_reason: "A book",
        p_idempotency_key: key,
      }),
    ),
  );
  expect(new Set(results.map((r) => r.request_id)).size).toBe(1);
  const { count, error } = await admin
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("child_id", child)
    .eq("idempotency_key", key);
  if (error) throw new Error(error.message);
  expect(count).toBe(1);
});

test("a deposit confirms even when a purchase races for the held Spend", async () => {
  const child = childAt(3);
  await fund(child, 500, 0);
  const id = await insertRequest(child, "deposit", "pending", 500);
  const [parent, kid] = await Promise.all([parentClient(), childClient(3)]);
  const [completed, purchase] = await Promise.all([
    rpc<string>(parent, "complete_request", { p_request_id: id, p_idempotency_key: randomUUID() }),
    rpc<{ status: string }>(kid, "record_purchase", {
      p_child_id: child,
      p_amount_minor: 500,
      p_label: "Sweets",
      p_idempotency_key: randomUUID(),
    }),
  ]);
  expect(completed).toBe("completed");
  expect(purchase.status).toBe("not_enough_spend");
  expect(await statusOf(id)).toBe("confirmed");
  expect(await ledgerCount(id)).toBe(2);
});
