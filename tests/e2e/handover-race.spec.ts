import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertLocalUrl, loadLocalSupabase } from "./local-supabase";

/**
 * Handover is exactly once under concurrent calls. No browser: separate HTTP requests from
 * parent-signed-in supabase-js clients hit the RPCs at the same time against LOCAL Supabase.
 */

const local = loadLocalSupabase();
test.skip(!local, "Local Supabase is not running: start it with `pnpm db:start`.");
test.describe.configure({ mode: "serial" });

const run = randomUUID().slice(0, 8);
const password = `pw-${randomUUID()}`;
const options = { auth: { autoRefreshToken: false, persistSession: false } };

let admin: SupabaseClient;
let parentId = "";
let familyId = "";
const childIds: string[] = [];
const authUserIds: string[] = [];

/** A fresh client signed in as the parent: its own connection and request per call. */
async function parentClient(): Promise<SupabaseClient> {
  if (!local) throw new Error("unreachable");
  const client = createClient(local.url, local.publishableKey, options);
  const { error } = await client.auth.signInWithPassword({
    email: `e2e-race-${run}@example.com`,
    password,
  });
  if (error) throw new Error(`Parent sign-in failed: ${error.message}`);
  return client;
}

async function rpcText(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return data as string;
}

async function ledgerCount(sourceId: string): Promise<number> {
  const { count, error } = await admin
    .from("ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  if (error) throw new Error(`Ledger count failed: ${error.message}`);
  return count ?? 0;
}

function childAt(i: number): string {
  const id = childIds[i];
  if (!id) throw new Error(`Child ${i} was not set up.`);
  return id;
}

const today = () => new Date().toISOString().slice(0, 10);
function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

async function addChild(parent: SupabaseClient, nickname: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `e2e-race-child-${nickname}-${run}@example.com`,
    password: `pw-${randomUUID()}`,
    email_confirm: true,
    app_metadata: { jarso_role: "child" },
  });
  if (error) throw new Error(`Child creation failed: ${error.message}`);
  authUserIds.push(data.user.id);
  const { error: regError } = await parent.rpc("register_child", {
    p_child_id: data.user.id,
    p_family_id: familyId,
    p_nickname: nickname,
    p_pin: "1234",
    p_consent: true,
  });
  if (regError) throw new Error(`register_child failed: ${regError.message}`);
  childIds.push(data.user.id);
  return data.user.id;
}

/** A due occurrence (allowance starting today) for a child. */
async function dueOccurrence(parent: SupabaseClient, childId: string): Promise<string> {
  await rpcText(parent, "create_allowance", {
    p_child_id: childId,
    p_amount_minor: 500,
    p_frequency: "weekly",
    p_first_on: today(),
  });
  const { data, error } = await admin
    .from("allowance_occurrences")
    .select("id")
    .eq("child_id", childId)
    .eq("status", "due")
    .single();
  if (error) throw new Error(`Occurrence lookup failed: ${error.message}`);
  return data.id;
}

async function dueGift(parent: SupabaseClient, childId: string): Promise<string> {
  return rpcText(parent, "create_gift", {
    p_child_id: childId,
    p_amount_minor: 500,
    p_give_on: today(),
    p_note: "",
  });
}

test.beforeAll(async () => {
  if (!local) return;
  assertLocalUrl(local.url);
  admin = createClient(local.url, local.secretKey, options);
  const { data, error } = await admin.auth.admin.createUser({
    email: `e2e-race-${run}@example.com`,
    password,
    email_confirm: true,
    app_metadata: { jarso_role: "parent" },
  });
  if (error) throw new Error(`Parent creation failed: ${error.message}`);
  parentId = data.user.id;
  authUserIds.push(parentId);

  const parent = await parentClient();
  familyId = await rpcText(parent, "create_family", { p_currency: "GBP", p_timezone: "UTC" });
  await addChild(parent, "RaceA");
  await addChild(parent, "RaceB");
  await addChild(parent, "RaceC");
});

test.afterAll(async () => {
  if (!admin) return;
  if (familyId) await admin.from("families").delete().eq("id", familyId);
  for (const id of authUserIds) await admin.auth.admin.deleteUser(id);
});

test("five concurrent confirm_handover calls confirm once", async () => {
  const parent = await parentClient();
  const id = await dueOccurrence(parent, childAt(0));
  const results = await Promise.all(
    Array.from({ length: 5 }, async (_, i) =>
      rpcText(await parentClient(), "confirm_handover", {
        p_occurrence_id: id,
        p_cash_minor: 300,
        p_saved_minor: 200,
        p_idempotency_key: `race-${i}-${randomUUID()}`,
      }),
    ),
  );
  expect(tally(results)).toEqual({ confirmed: 1, already_confirmed: 4 });
  expect(await ledgerCount(id)).toBe(2);
});

test("confirm_handover racing mark_not_given changes state once", async () => {
  const parent = await parentClient();
  const id = await dueOccurrence(parent, childAt(1));
  const [a, b] = await Promise.all([
    parentClient().then((c) =>
      rpcText(c, "confirm_handover", {
        p_occurrence_id: id,
        p_cash_minor: 300,
        p_saved_minor: 200,
        p_idempotency_key: `race-${randomUUID()}`,
      }),
    ),
    parentClient().then((c) => rpcText(c, "mark_not_given", { p_occurrence_id: id })),
  ]);
  const confirmedWon = a === "confirmed";
  expect(confirmedWon ? b : a).toBe(confirmedWon ? "already_handled" : "already_confirmed");
  if (!confirmedWon) expect(b).toBe("closed");
  expect(await ledgerCount(id)).toBe(confirmedWon ? 2 : 0);
  const { data } = await admin.from("allowance_occurrences").select("status").eq("id", id).single();
  expect(data?.status).toBe(confirmedWon ? "confirmed" : "closed");
});

test("five concurrent confirm_gift_handover calls confirm once", async () => {
  const parent = await parentClient();
  const id = await dueGift(parent, childAt(2));
  const results = await Promise.all(
    Array.from({ length: 5 }, async (_, i) =>
      rpcText(await parentClient(), "confirm_gift_handover", {
        p_gift_id: id,
        p_cash_minor: 300,
        p_saved_minor: 200,
        p_idempotency_key: `race-${i}-${randomUUID()}`,
      }),
    ),
  );
  expect(tally(results)).toEqual({ confirmed: 1, already_confirmed: 4 });
  expect(await ledgerCount(id)).toBe(2);
});
