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

/** A purchase can be undone for this long after it happened. */
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

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
  return [...groups.values()];
}

/** One purchase entry as its own line; its reversal row never shows, `reversed` marks it undone. */
function purchaseItem(row: LedgerRow, timezone: string, now: number): HistoryItem & { at: string } {
  const undone = row.reversed;
  return {
    id: row.id,
    kind: "purchase",
    amountMinor: row.amountMinor,
    dueMinor: null,
    label: row.label ?? "Purchase",
    occurredOn: localDate(row.occurredAt, timezone),
    undone,
    entryId: row.id,
    canUndo: !undone && now - Date.parse(row.occurredAt) < UNDO_WINDOW_MS,
    at: row.occurredAt,
  };
}

const REQUEST_KIND: Record<string, "withdrawal" | "deposit"> = {
  withdrawal_out: "withdrawal",
  withdrawal_in: "withdrawal",
  deposit_out: "deposit",
  deposit_in: "deposit",
};

/** One line per request: its out/in pair is the same amount, so the first row stands for both. */
function requestItems(rows: LedgerRow[], timezone: string): (HistoryItem & { at: string })[] {
  const seen = new Set<string>();
  const items: (HistoryItem & { at: string })[] = [];
  for (const row of rows) {
    const kind = REQUEST_KIND[row.kind];
    if (row.sourceType !== "request" || !kind || !row.sourceId || seen.has(row.sourceId)) continue;
    seen.add(row.sourceId);
    items.push({
      id: row.sourceId,
      kind,
      amountMinor: row.amountMinor,
      dueMinor: null,
      // The database always labels a request pair (the reason, "Taken out of Save", "Put into Save").
      label: row.label ?? "",
      occurredOn: localDate(row.occurredAt, timezone),
      undone: false,
      entryId: null,
      canUndo: false,
      at: row.occurredAt,
    });
  }
  return items;
}

export type HistoryPage = {
  items: HistoryItem[];
  /** Cursor for the next, older page (`before`), or null when this is the last page. */
  olderBefore: string | null;
};

/**
 * Allowances, gifts and purchases (each its own line, undone ones marked) that reached the jars (Spend and Save of one handover as one item), plus
 * allowances closed as not given (`skipped`, no amount). Newest first, at most 50, and only
 * those before the `before` cursor when given.
 */
export async function getHistoryPage(childId: string, before?: string): Promise<HistoryPage> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const [rows, closed, family] = await Promise.all([
    listLedgerRows(db, childId, ROW_LIMIT, before),
    listClosedOccurrences(db, childId, HISTORY_LIMIT + 1, before),
    getFamily(),
  ]);
  const timezone = family?.timezone ?? "UTC";
  const now = Date.now(); // Server clock decides canUndo.
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
        undone: false,
        entryId: null,
        canUndo: false,
        at: group.at,
      };
    }),
    ...rows.filter((row) => row.kind === "purchase").map((row) => purchaseItem(row, timezone, now)),
    ...requestItems(rows, timezone),
    ...closed.map((occurrence) => ({
      id: occurrence.id,
      kind: "skipped" as const,
      amountMinor: null,
      dueMinor: null,
      label: "Allowance",
      occurredOn: localDate(occurrence.closedAt, timezone),
      undone: false,
      entryId: null,
      canUndo: false,
      at: occurrence.closedAt,
    })),
  ];

  // A full read of rows may have cut the oldest source's rows in two, and says nothing about
  // anything older: keep only what is newer than its last row, and leave the rest to the next page.
  const lastRow = rows.length >= ROW_LIMIT ? rows[rows.length - 1] : undefined;
  const cutoff = lastRow ? Date.parse(lastRow.occurredAt) : Number.NEGATIVE_INFINITY;
  const sorted = items
    .filter((item) => Date.parse(item.at) > cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const page = sorted.slice(0, HISTORY_LIMIT);
  const hasOlder = sorted.length > HISTORY_LIMIT || lastRow !== undefined;

  return {
    items: page.map(({ at: _at, ...item }) => item),
    olderBefore: hasOlder ? (page.at(-1)?.at ?? null) : null,
  };
}

/** The newest page of history, for previews. */
export async function getHistory(childId: string): Promise<HistoryItem[]> {
  return (await getHistoryPage(childId)).items;
}
