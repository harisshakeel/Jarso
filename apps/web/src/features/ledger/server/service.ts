import "server-only";
import type { HistoryItem, Jars } from "@jarso/core/ledger";
import { assertSelfOrParentOf, getFamily } from "@/features/family/server";
import { createClient } from "@/lib/supabase/server";
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
/** A purchase or received line can be fixed for this long. */
const FIX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
  paidByCard: boolean;
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
    if (group) {
      group.amount += signed;
      group.paidByCard ||= row.method === "card";
    } else {
      groups.set(key, {
        kind,
        sourceId: row.sourceId,
        label: row.label ?? (kind === "gift" ? "Gift" : "Allowance"),
        amount: signed,
        at: row.occurredAt,
        paidByCard: row.method === "card",
      });
    }
  }
  return [...groups.values()];
}

type Timed = HistoryItem & { at: string };

/**
 * One diary entry (a purchase, or money received) as its own line. Its reversal row never shows.
 * A fix replaces the old line: that one is dropped, and the new one says what it was.
 * Windows count from the chain root, so a fix does not extend the undo time.
 */
function diaryItem(row: LedgerRow, timezone: string, now: number): Timed | null {
  if (row.replaced) return null;
  const received = row.kind === "gift_in";
  const undone = row.reversed;
  const age = row.windowFrom ? now - Date.parse(row.windowFrom) : Number.POSITIVE_INFINITY;
  return {
    id: row.id,
    kind: received ? "received" : "purchase",
    amountMinor: row.amountMinor,
    dueMinor: null,
    label: row.label ?? (received ? "Money received" : "Purchase"),
    occurredOn: localDate(row.occurredAt, timezone),
    undone,
    entryId: row.id,
    canUndo: !undone && age < UNDO_WINDOW_MS,
    paidByCard: false,
    category: row.category,
    jar: received ? row.jar : null,
    canFix: !undone && age < FIX_WINDOW_MS,
    fixedFrom:
      row.correctsEntryId && row.prevAmountMinor !== null
        ? {
            amountMinor: row.prevAmountMinor,
            category: row.prevCategory,
            label: row.prevLabel ?? "",
          }
        : null,
    at: row.occurredAt,
  };
}

const REQUEST_KIND: Record<string, "withdrawal" | "deposit" | "extra"> = {
  withdrawal_out: "withdrawal",
  withdrawal_in: "withdrawal",
  deposit_out: "deposit",
  deposit_in: "deposit",
  grant_in: "extra",
};

/**
 * One line per request: a move's out/in pair is the same amount, so the first row stands for
 * both; an emergency grant (FR15) is a single row.
 */
function requestItems(rows: LedgerRow[], timezone: string): Timed[] {
  const seen = new Set<string>();
  const items: Timed[] = [];
  for (const row of rows) {
    const kind = REQUEST_KIND[row.kind];
    if (row.sourceType !== "request" || !kind || !row.sourceId || seen.has(row.sourceId)) continue;
    seen.add(row.sourceId);
    items.push({
      id: row.sourceId,
      kind,
      amountMinor: row.amountMinor,
      dueMinor: null,
      // The database always labels a request row (the reason, "Taken out of Save", "Put into Save").
      label: row.label ?? "",
      occurredOn: localDate(row.occurredAt, timezone),
      undone: false,
      entryId: null,
      canUndo: false,
      paidByCard: false,
      category: null,
      jar: null,
      canFix: false,
      fixedFrom: null,
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

  const items: Timed[] = [
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
        paidByCard: group.paidByCard,
        category: null,
        jar: null,
        canFix: false,
        fixedFrom: null,
        at: group.at,
      };
    }),
    ...rows
      .filter(
        (row) => row.kind === "purchase" || (row.kind === "gift_in" && row.sourceType === "diary"),
      )
      .map((row) => diaryItem(row, timezone, now))
      .filter((item): item is Timed => item !== null),
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
      paidByCard: false,
      category: null,
      jar: null,
      canFix: false,
      fixedFrom: null,
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

/** Every history item back to the week's start: more pages only when the newest page stops inside the week. */
export async function getHistorySince(childId: string, weekStart: string): Promise<HistoryItem[]> {
  const items: HistoryItem[] = [];
  let before: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await getHistoryPage(childId, before);
    items.push(...result.items);
    const oldest = result.items.at(-1);
    if (!result.olderBefore || !oldest || oldest.occurredOn < weekStart) break;
    before = result.olderBefore;
  }
  return items;
}
