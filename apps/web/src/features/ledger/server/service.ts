import "server-only";
import {
  type BalanceHistory,
  balanceHistory,
  type HistoryItem,
  type Jars,
} from "@jarso/core/ledger";
import {
  type HistoryPage,
  getHistoryPage as loadHistoryPage,
  getHistorySince as loadHistorySince,
  getJars as loadJars,
  localDate,
} from "@jarso/data/ledger";
import { assertSelfOrParentOf, getFamily } from "@/features/family/server";
import { addDays, familyToday } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import { fetchBalance, listMovementsSince } from "./repository";

export type { HistoryPage };

/** Reads of a child's money. The child or a parent of the child only. */

export async function getJars(childId: string): Promise<Jars> {
  await assertSelfOrParentOf(childId);
  return loadJars(await createClient(), childId);
}

/** Days the child's graph can look back; the longest period it offers. */
const GRAPH_DAYS = 90;

/**
 * Where both jars stood at the end of each of the last GRAPH_DAYS days, ending at today's
 * balances (the graph on the child's Home). One read of the movements; the walk-back is pure.
 */
export async function getBalanceHistory(childId: string): Promise<BalanceHistory> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const family = await getFamily();
  const timezone = family?.timezone ?? "UTC";
  const today = familyToday(timezone);
  const from = addDays(today, -(GRAPH_DAYS - 1));
  // A day earlier than `from` in UTC covers every timezone's start of that day.
  const [spend, save, rows] = await Promise.all([
    fetchBalance(db, childId, "spend"),
    fetchBalance(db, childId, "save"),
    listMovementsSince(db, childId, `${addDays(from, -1)}T00:00:00Z`),
  ]);
  const movements = rows.map((row) => ({
    jar: row.jar,
    direction: row.direction,
    amountMinor: row.amountMinor,
    occurredOn: localDate(row.occurredAt, timezone),
  }));
  return balanceHistory({ spend, save }, movements, from, today);
}

/**
 * Allowances, gifts and purchases that reached the jars, plus allowances closed as not given.
 * Newest first, at most 50, and only those before the `before` cursor when given.
 */
export async function getHistoryPage(childId: string, before?: string): Promise<HistoryPage> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const family = await getFamily();
  return loadHistoryPage(db, childId, {
    timezone: family?.timezone ?? "UTC",
    now: Date.now(), // Server clock decides canUndo.
    before,
  });
}

/** The newest page of history, for previews. */
export async function getHistory(childId: string): Promise<HistoryItem[]> {
  return (await getHistoryPage(childId)).items;
}

/** Every history item back to the week's start: more pages only when the newest page stops inside the week. */
export async function getHistorySince(childId: string, weekStart: string): Promise<HistoryItem[]> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const family = await getFamily();
  return loadHistorySince(db, childId, weekStart, {
    timezone: family?.timezone ?? "UTC",
    now: Date.now(), // Server clock decides canUndo.
  });
}
