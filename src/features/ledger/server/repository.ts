import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toAppError } from "@/lib";
import type { Database } from "@/types";
import type { Jar } from "../types";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows ledger table, column and function names. Pure data access, no auth
 * decisions; `db` is the user's server client, so RLS and the functions' own checks apply.
 */

export type LedgerRow = {
  id: string;
  jar: Jar;
  direction: "in" | "out";
  amountMinor: number;
  label: string | null;
  sourceType: string;
  sourceId: string | null;
  occurredAt: string;
};

export type OccurrenceAmounts = { id: string; amountMinor: number; shortfallMinor: number };
export type ClosedOccurrence = { id: string; closedAt: string };

export async function fetchBalance(db: Client, childId: string, jar: Jar): Promise<number> {
  const { data, error } = await db.rpc("balance", { p_child_id: childId, p_jar: jar });
  if (error) throw toAppError(error, "Failed to load jars");
  return Number(data ?? 0);
}

/** Recorded-mode entries, newest first. */
export async function listLedgerRows(
  db: Client,
  childId: string,
  limit: number,
): Promise<LedgerRow[]> {
  const { data, error } = await db.rpc("list_ledger_history", {
    p_child_id: childId,
    p_limit: limit,
  });
  if (error) throw toAppError(error, "Failed to load history");
  return data.map((row) => ({
    id: row.id,
    jar: row.jar === "save" ? "save" : "spend",
    direction: row.direction === "out" ? "out" : "in",
    amountMinor: Number(row.amount_minor),
    label: row.label,
    sourceType: row.source_type,
    sourceId: row.source_id,
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

/** Allowance occurrences closed as not given, newest first. */
export async function listClosedOccurrences(
  db: Client,
  childId: string,
  limit: number,
): Promise<ClosedOccurrence[]> {
  const { data, error } = await db
    .from("allowance_occurrences")
    .select("id, confirmed_at")
    .eq("child_id", childId)
    .eq("status", "closed")
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false })
    .limit(limit);
  if (error) throw toAppError(error, "Failed to load history");
  return data.flatMap((row) =>
    row.confirmed_at ? [{ id: row.id, closedAt: row.confirmed_at }] : [],
  );
}
