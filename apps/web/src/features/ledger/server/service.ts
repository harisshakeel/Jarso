import "server-only";
import type { BalanceHistory, HistoryItem, Jars } from "@jarso/core/ledger";
import {
  type HistoryPage,
  getBalanceHistory as loadBalanceHistory,
  getHistoryPage as loadHistoryPage,
  getHistorySince as loadHistorySince,
  getJars as loadJars,
} from "@jarso/data/ledger";
import { assertSelfOrParentOf, getFamily } from "@/features/family/server";
import { createClient } from "@/lib/supabase/server";

export type { HistoryPage };

/** Reads of a child's money. The child or a parent of the child only. */

export async function getJars(childId: string): Promise<Jars> {
  await assertSelfOrParentOf(childId);
  return loadJars(await createClient(), childId);
}

/**
 * Where both jars stood at the end of each day the graph can show, ending at today's balances
 * (the graph on the child's Home), in the family's timezone.
 */
export async function getBalanceHistory(childId: string): Promise<BalanceHistory> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const family = await getFamily();
  return loadBalanceHistory(db, childId, {
    timezone: family?.timezone ?? "UTC",
    now: new Date(), // Server clock decides today.
  });
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
