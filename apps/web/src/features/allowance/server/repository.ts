import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toAppError } from "@/lib";
import type { Database } from "@/types";

type Client = SupabaseClient<Database>;

/**
 * Allowance and gift data access. The shared reads and writes live in `@jarso/data/allowance` (the
 * phone calls them too) and are re-exported here; only the child's allowance-day read is web-only.
 */
export {
  cancelPendingGift,
  changeGift,
  changeSchedule,
  closeOccurrence,
  confirmGiftHandover,
  confirmOccurrenceHandover,
  fetchNextDueOn,
  fetchScheduleAutoCharge,
  findGift,
  findLatestAllowanceSplit,
  findLatestGiftSplit,
  findOccurrenceChildId,
  findOccurrencePlannedSave,
  findScheduleChildId,
  findScheduleRow,
  findScheduleState,
  type GiftRecord,
  type GiftRow,
  insertGift,
  insertSchedule,
  type LatestSplit,
  listDueForParent,
  listPendingGifts,
  markPlanDecided,
  pauseSchedule,
  resumeSchedule,
  type ScheduleRow,
  stopSchedule,
  sumDueOccurrences,
} from "@jarso/data/allowance";

/** The child's most recent handed-over allowance, for the allowance-day plan. */
export type ConfirmedOccurrence = {
  id: string;
  cashMinor: number;
  savedMinor: number;
  confirmedAt: string;
  /** Set once the child took or dismissed the plan for it. */
  planDecidedAt: string | null;
};

/** The child's latest confirmed allowance occurrence, or null before the first handover. */
export async function findLatestConfirmedOccurrence(
  db: Client,
  childId: string,
): Promise<ConfirmedOccurrence | null> {
  const { data, error } = await db
    .from("allowance_occurrences")
    .select("id, cash_minor, saved_minor, confirmed_at, plan_decided_at")
    .eq("child_id", childId)
    .eq("status", "confirmed")
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the last handover");
  if (!data?.confirmed_at) return null;
  return {
    id: data.id,
    cashMinor: Number(data.cash_minor ?? 0),
    savedMinor: Number(data.saved_minor ?? 0),
    confirmedAt: data.confirmed_at,
    planDecidedAt: data.plan_decided_at,
  };
}
