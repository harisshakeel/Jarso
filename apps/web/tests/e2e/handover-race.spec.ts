import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addChild, createParentUser, dueOccurrence, signedInClient } from "./helpers";
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
  return signedInClient(local, `e2e-race-${run}@example.com`, password);
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
/** Signs in `n` separate clients up front, so the race calls themselves start together. */
function parentClients(n: number): Promise<SupabaseClient[]> {
  return Promise.all(Array.from({ length: n }, () => parentClient()));
}

function tally(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

async function addRaceChild(parent: SupabaseClient, nickname: string): Promise<string> {
  const id = await addChild(admin, parent, {
    familyId,
    nickname,
    email: `e2e-race-child-${nickname}-${run}@example.com`,
  });
  authUserIds.push(id);
  childIds.push(id);
  return id;
}

async function dueGift(parent: SupabaseClient, childId: string): Promise<string> {
  return rpcText(parent, "create_gift", {
    p_child_id: childId,
    p_amount_minor: 500,
    p_give_on: today(),
    p_note: "",
    p_idempotency_key: randomUUID(),
  });
}

test.beforeAll(async () => {
  if (!local) return;
  assertLocalUrl(local.url);
  admin = createClient(local.url, local.secretKey, options);
  parentId = await createParentUser(admin, `e2e-race-${run}@example.com`, password);
  authUserIds.push(parentId);

  const parent = await parentClient();
  familyId = await rpcText(parent, "create_family", { p_currency: "GBP", p_timezone: "UTC" });
  await addRaceChild(parent, "RaceA");
  await addRaceChild(parent, "RaceB");
  await addRaceChild(parent, "RaceC");
});

test.afterAll(async () => {
  if (!admin) return;
  if (familyId) await admin.from("families").delete().eq("id", familyId);
  for (const id of authUserIds) await admin.auth.admin.deleteUser(id);
});

test("five concurrent confirm_handover calls confirm once", async () => {
  const parent = await parentClient();
  const id = await dueOccurrence(admin, parent, childAt(0));
  const clients = await parentClients(5);
  const results = await Promise.all(
    clients.map((client, i) =>
      rpcText(client, "confirm_handover", {
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
  const id = await dueOccurrence(admin, parent, childAt(1));
  const [first, second] = await parentClients(2);
  if (!first || !second) throw new Error("unreachable");
  const [a, b] = await Promise.all([
    rpcText(first, "confirm_handover", {
      p_occurrence_id: id,
      p_cash_minor: 300,
      p_saved_minor: 200,
      p_idempotency_key: `race-${randomUUID()}`,
    }),
    rpcText(second, "mark_not_given", { p_occurrence_id: id }),
  ]);
  const confirmedWon = a === "confirmed";
  expect(confirmedWon ? b : a).toBe(confirmedWon ? "already_handled" : "not_given");
  if (!confirmedWon) expect(b).toBe("closed");
  expect(await ledgerCount(id)).toBe(confirmedWon ? 2 : 0);
  const { data } = await admin.from("allowance_occurrences").select("status").eq("id", id).single();
  expect(data?.status).toBe(confirmedWon ? "confirmed" : "closed");
});

test("five concurrent confirm_gift_handover calls confirm once", async () => {
  const parent = await parentClient();
  const id = await dueGift(parent, childAt(2));
  const clients = await parentClients(5);
  const results = await Promise.all(
    clients.map((client, i) =>
      rpcText(client, "confirm_gift_handover", {
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
