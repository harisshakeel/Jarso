import type { ScheduleStatus } from "@jarso/core/allowance";
import { toAppError } from "@jarso/core/lib";
import type { Database } from "@jarso/db";
// Child-safe reads of the allowance tables: no payment columns.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Client = SupabaseClient<Database>;

/** The child's most recent schedule's amount and status, or null. A stopped one too. */
export async function findLatestSchedule(
  db: Client,
  childId: string,
): Promise<{ amountMinor: number; status: ScheduleStatus } | null> {
  const { data, error } = await db
    .from("allowance_schedules")
    .select("amount_minor, status")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load allowance");
  if (!data) return null;
  const status: ScheduleStatus =
    data.status === "paused" || data.status === "stopped" ? data.status : "active";
  return { amountMinor: Number(data.amount_minor), status };
}

/** Allowances waiting for a parent (total and count). Allowances only: gifts stay secret. */
export async function sumDueOccurrences(
  db: Client,
  childId: string,
): Promise<{ totalMinor: number; count: number }> {
  const { data, error } = await db
    .from("allowance_occurrences")
    .select("amount_minor")
    .eq("child_id", childId)
    .eq("status", "due");
  if (error) throw toAppError(error, "Failed to load what's waiting");
  return {
    totalMinor: data.reduce((sum, row) => sum + Number(row.amount_minor), 0),
    count: data.length,
  };
}
