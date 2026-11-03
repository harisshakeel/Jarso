import type { Jar } from "@jarso/core/ledger";
import { toAppError } from "@jarso/core/lib";
import type { Database } from "@jarso/db";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Client = SupabaseClient<Database>;

/**
 * Only place that knows ledger table, column and function names. Pure data access, no auth
 * decisions; `db` is the user's server client, so RLS and the functions' own checks apply.
 */

export type LedgerRow = {
  id: string;
  kind: string;
  /** Set on a reversal row: the entry it reverses. */
  reversesEntryId: string | null;
  /** True when a reversal entry exists for this row. */
  reversed: boolean;
  jar: Jar;
  direction: "in" | "out";
  amountMinor: number;
  label: string | null;
  sourceType: string;
  sourceId: string | null;
  occurredAt: string;
  /** How the money was handed over: card for a card payment, cash for everything else. */
  method: "cash" | "card";
  category: string | null;
  /** The earlier line this one replaced (a fix), or null. */
  correctsEntryId: string | null;
  /** True when a later fix replaced this row. */
  replaced: boolean;
  /** The chain root's created_at: undo and fix windows count from here. */
  windowFrom: string | null;
  /** Values of the line `correctsEntryId` points at. */
  prevAmountMinor: number | null;
  prevCategory: string | null;
  prevLabel: string | null;
};

/** A recorded line reduced to what moves a balance (the graph on the child's Home). */
export type MovementRow = {
  jar: Jar;
  direction: "in" | "out";
  amountMinor: number;
  occurredAt: string;
};

export type OccurrenceAmounts = { id: string; amountMinor: number; shortfallMinor: number };
export type ClosedOccurrence = { id: string; closedAt: string };

export async function fetchBalance(db: Client, childId: string, jar: Jar): Promise<number> {
  const { data, error } = await db.rpc("balance", { p_child_id: childId, p_jar: jar });
  if (error) throw toAppError(error, "Failed to load jars");
  return Number(data ?? 0);
}

/** Recorded-mode entries, newest first; only those before `before` when given. */
export async function listLedgerRows(
  db: Client,
  childId: string,
  limit: number,
  before?: string,
): Promise<LedgerRow[]> {
  const { data, error } = await db.rpc("list_ledger_history", {
    p_child_id: childId,
    p_limit: limit,
    p_before: before,
  });
  if (error) throw toAppError(error, "Failed to load history");
  return data.map((row) => ({
    id: row.id,
    kind: row.kind,
    reversesEntryId: row.reverses_entry_id,
    reversed: row.reversed,
    jar: row.jar === "save" ? "save" : "spend",
    direction: row.direction === "out" ? "out" : "in",
    amountMinor: Number(row.amount_minor),
    label: row.label,
    sourceType: row.source_type,
    sourceId: row.source_id,
    occurredAt: row.occurred_at,
    method: row.method === "card" ? "card" : "cash",
    category: row.category ?? null,
    correctsEntryId: row.corrects_entry_id ?? null,
    replaced: row.replaced === true,
    windowFrom: row.window_from ?? null,
    prevAmountMinor: row.prev_amount_minor == null ? null : Number(row.prev_amount_minor),
    prevCategory: row.prev_category ?? null,
    prevLabel: row.prev_label ?? null,
  }));
}

/** Every recorded movement since an instant, oldest first (RLS: the child or their parent). */
export async function listMovementsSince(
  db: Client,
  childId: string,
  since: string,
): Promise<MovementRow[]> {
  const { data, error } = await db
    .from("ledger_entries")
    .select("jar, direction, amount_minor, occurred_at")
    .eq("child_id", childId)
    .eq("mode", "recorded")
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true });
  if (error) throw toAppError(error, "Failed to load history");
  return data.map((row) => ({
    jar: row.jar === "save" ? "save" : "spend",
    direction: row.direction === "out" ? "out" : "in",
    amountMinor: Number(row.amount_minor),
    occurredAt: row.occurred_at,
  }));
}

/** Planned amount and shortfall of the given allowance occurrences. */
export async function listOccurrenceAmounts(
  db: Client,
  ids: string[],
): Promise<OccurrenceAmounts[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db
    .from("allowance_occurrences")
    .select("id, amount_minor, shortfall_minor")
    .in("id", ids);
  if (error) throw toAppError(error, "Failed to load history");
  return data.map((row) => ({
    id: row.id,
    amountMinor: Number(row.amount_minor),
    shortfallMinor: Number(row.shortfall_minor),
  }));
}

/** Allowance occurrences closed as not given, newest first; only those before `before` when given. */
export async function listClosedOccurrences(
  db: Client,
  childId: string,
  limit: number,
  before?: string,
): Promise<ClosedOccurrence[]> {
  let query = db
    .from("allowance_occurrences")
    .select("id, confirmed_at")
    .eq("child_id", childId)
    .eq("status", "closed")
    .not("confirmed_at", "is", null);
  if (before) query = query.lt("confirmed_at", before);
  const { data, error } = await query.order("confirmed_at", { ascending: false }).limit(limit);
  if (error) throw toAppError(error, "Failed to load history");
  return data.flatMap((row) =>
    row.confirmed_at ? [{ id: row.id, closedAt: row.confirmed_at }] : [],
  );
}
