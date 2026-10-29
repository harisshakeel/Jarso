import "server-only";
import { assertSelfOrParentOf, getFamily } from "@/features/family/server";
import { createClient } from "@/lib/supabase/server";
import type { HistoryItem, Jars } from "../types";
import {
  fetchBalance,
  type LedgerRow,
  listClosedOccurrences,
  listLedgerRows,
  listOccurrenceAmounts,
} from "./repository";

/** Reads of a child's money. The child or a parent of the child only. */

const HISTORY_LIMIT = 50;
/** A handover writes up to two rows (Spend and Save), so read enough rows for the items. */
const ROW_LIMIT = HISTORY_LIMIT * 2;

const SOURCE_KIND: Record<string, "allowance" | "gift"> = {
  occurrence: "allowance",
  parent_gift: "gift",
};

export async function getJars(childId: string): Promise<Jars> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const [spend, save] = await Promise.all([
    fetchBalance(db, childId, "spend"),
    fetchBalance(db, childId, "save"),
  ]);
  return { spend, save };
}

/** ISO date of an instant in the family's timezone. */
function localDate(instant: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

type Group = {
  kind: "allowance" | "gift";
  sourceId: string;
  label: string;
  amount: number;
  at: string;
};

/** One group per source (its Spend and Save rows), in row order (newest first). */
function groupBySource(rows: LedgerRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const kind = SOURCE_KIND[row.sourceType];
    if (!kind || !row.sourceId) continue; // Other sources arrive with later slices.
    const key = `${row.sourceType}:${row.sourceId}`;
    const signed = row.direction === "in" ? row.amountMinor : -row.amountMinor;
    const group = groups.get(key);
    if (group) group.amount += signed;
    else {
      groups.set(key, {
        kind,
        sourceId: row.sourceId,
        label: row.label ?? (kind === "gift" ? "Gift" : "Allowance"),
        amount: signed,
        at: row.occurredAt,
      });
    }
  }
  const list = [...groups.values()];
  // A full page may have cut the oldest source's rows in two: drop it rather than show half.
  if (rows.length >= ROW_LIMIT) list.pop();
  return list;
}

/**
 * Allowances and gifts that reached the jars (Spend and Save of one handover as one item), plus
 * allowances closed as not given (`skipped`, no amount). Newest first, at most 50.
 */
export async function getHistory(childId: string): Promise<HistoryItem[]> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const [rows, closed, family] = await Promise.all([
    listLedgerRows(db, childId, ROW_LIMIT),
    listClosedOccurrences(db, childId, HISTORY_LIMIT),
    getFamily(),
  ]);
  const timezone = family?.timezone ?? "UTC";
  const groups = groupBySource(rows);

  const occurrenceIds = groups.filter((g) => g.kind === "allowance").map((g) => g.sourceId);
  const amounts = new Map(
    (await listOccurrenceAmounts(db, occurrenceIds)).map((o) => [o.id, o] as const),
  );

  const items: (HistoryItem & { at: string })[] = [
    ...groups.map((group) => {
      const occurrence = group.kind === "allowance" ? amounts.get(group.sourceId) : undefined;
      return {
        id: group.sourceId,
        kind: group.kind,
        amountMinor: group.amount,
        dueMinor: occurrence && occurrence.shortfallMinor > 0 ? occurrence.amountMinor : null,
        label: group.label,
        occurredOn: localDate(group.at, timezone),
        at: group.at,
      };
    }),
    ...closed.map((occurrence) => ({
      id: occurrence.id,
      kind: "skipped" as const,
      amountMinor: null,
      dueMinor: null,
      label: "Allowance",
      occurredOn: localDate(occurrence.closedAt, timezone),
      at: occurrence.closedAt,
    })),
  ];

  return items
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, HISTORY_LIMIT)
    .map(({ at: _at, ...item }) => item);
}
