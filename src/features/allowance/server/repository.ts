import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import {
  type DueItem,
  type Frequency,
  frequencies,
  type Gift,
  type GiftStatus,
  type HandoverResult,
  type NotGivenResult,
  type ScheduleStatus,
  type Split,
} from "../types";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows allowance and gift table, column and function names. Pure data access,
 * no auth decisions; `db` is the user's server client, so RLS and the functions' own checks apply.
 */

export type ScheduleRow = {
  id: string;
  amountMinor: number;
  frequency: Frequency;
  status: ScheduleStatus;
  anchorOn: string;
  pausedThrough: string | null;
  pauseMessage: string | null;
};

export type GiftRow = Gift & { childId: string };
export type LatestSplit = Split & { at: string };

function asFrequency(value: string): Frequency {
  if ((frequencies as readonly string[]).includes(value)) return value as Frequency;
  throw new AppError("INTERNAL", "Failed to load allowance", { cause: { frequency: value } });
}

function asScheduleStatus(value: string): ScheduleStatus {
  return value === "paused" || value === "stopped" ? value : "active";
}

function asGiftStatus(value: string): GiftStatus {
  return value === "given" || value === "cancelled" ? value : "pending";
}

function oneOf<const T extends string>(value: string, allowed: readonly T[], fallback: string): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new AppError("INTERNAL", fallback, { cause: { result: value } });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The child's most recent schedule, whatever its status (so a stopped one can be shown). */
export async function findLatestSchedule(db: Client, childId: string): Promise<ScheduleRow | null> {
  const { data, error } = await db
    .from("allowance_schedules")
    .select("id, amount_minor, frequency, status, anchor_on, paused_through, pause_message")
    .eq("child_id", childId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load allowance");
  if (!data) return null;
  return {
    id: data.id,
    amountMinor: Number(data.amount_minor),
    frequency: asFrequency(data.frequency),
    status: asScheduleStatus(data.status),
    anchorOn: data.anchor_on,
    pausedThrough: data.paused_through,
    pauseMessage: data.pause_message,
  };
}

export async function fetchNextDueOn(db: Client, scheduleId: string): Promise<string | null> {
  const { data, error } = await db.rpc("allowance_next_due_on", { p_schedule_id: scheduleId });
  if (error) throw toAppError(error, "Failed to load allowance");
  return data ?? null;
}

/** The schedule's child, or null when it doesn't exist or isn't visible to the caller. */
export async function findScheduleChildId(db: Client, scheduleId: string): Promise<string | null> {
  const { data, error } = await db
    .from("allowance_schedules")
    .select("child_id")
    .eq("id", scheduleId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load allowance");
  return data?.child_id ?? null;
}

export async function findOccurrenceChildId(
  db: Client,
  occurrenceId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("allowance_occurrences")
    .select("child_id")
    .eq("id", occurrenceId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load allowance");
  return data?.child_id ?? null;
}

export async function findGift(db: Client, giftId: string): Promise<GiftRow | null> {
  const { data, error } = await db
    .from("parent_gifts")
    .select("id, child_id, amount_minor, give_on, note, status")
    .eq("id", giftId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load gift");
  if (!data) return null;
  return {
    id: data.id,
    childId: data.child_id,
    amountMinor: Number(data.amount_minor),
    giveOn: data.give_on,
    note: data.note,
    status: asGiftStatus(data.status),
  };
}

/** Pending gifts (due and future), soonest first. */
export async function listPendingGifts(db: Client, childId: string): Promise<Gift[]> {
  const { data, error } = await db
    .from("parent_gifts")
    .select("id, amount_minor, give_on, note, status")
    .eq("child_id", childId)
    .eq("status", "pending")
    .order("give_on", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw toAppError(error, "Failed to load gifts");
  return data.map((row) => ({
    id: row.id,
    amountMinor: Number(row.amount_minor),
    giveOn: row.give_on,
    note: row.note,
    status: asGiftStatus(row.status),
  }));
}

/** Due allowances and due pending gifts, oldest first. Parent only (the function checks). */
export async function listDueForParent(db: Client, childId: string): Promise<DueItem[]> {
  const { data, error } = await db.rpc("list_due_for_parent", { p_child_id: childId });
  if (error) throw toAppError(error, "Failed to load what's due");
  return data.map((row) => ({
    kind: row.kind === "gift" ? "gift" : "allowance",
    id: row.id,
    dueOn: row.due_on,
    amountMinor: Number(row.amount_minor),
    note: row.note ?? null,
  }));
}

/** Total and count of the child's allowances waiting for a parent. Never reads gifts. */
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

export async function findLatestAllowanceSplit(
  db: Client,
  childId: string,
): Promise<LatestSplit | null> {
  const { data, error } = await db
    .from("allowance_occurrences")
    .select("cash_minor, saved_minor, confirmed_at")
    .eq("child_id", childId)
    .eq("status", "confirmed")
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the last handover");
  if (!data?.confirmed_at) return null;
  return {
    cash: Number(data.cash_minor ?? 0),
    saved: Number(data.saved_minor ?? 0),
    at: data.confirmed_at,
  };
}

export async function findLatestGiftSplit(
  db: Client,
  childId: string,
): Promise<LatestSplit | null> {
  const { data, error } = await db
    .from("parent_gifts")
    .select("cash_minor, saved_minor, given_at")
    .eq("child_id", childId)
    .eq("status", "given")
    .not("given_at", "is", null)
    .order("given_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the last handover");
  if (!data?.given_at) return null;
  return {
    cash: Number(data.cash_minor ?? 0),
    saved: Number(data.saved_minor ?? 0),
    at: data.given_at,
  };
}

// ---------------------------------------------------------------------------
// Parent writes (security definer functions; each re-checks the caller)
// ---------------------------------------------------------------------------

export async function insertSchedule(
  db: Client,
  args: { childId: string; amountMinor: number; frequency: Frequency; firstOn: string },
): Promise<string> {
  const { data, error } = await db.rpc("create_allowance", {
    p_child_id: args.childId,
    p_amount_minor: args.amountMinor,
    p_frequency: args.frequency,
    p_first_on: args.firstOn,
  });
  if (error) throw toAppError(error, "Failed to set up the allowance");
  return data;
}

export async function changeSchedule(
  db: Client,
  args: { scheduleId: string; amountMinor: number; frequency: Frequency; nextOn: string },
): Promise<void> {
  const { error } = await db.rpc("change_allowance", {
    p_schedule_id: args.scheduleId,
    p_amount_minor: args.amountMinor,
    p_frequency: args.frequency,
    p_next_on: args.nextOn,
  });
  if (error) throw toAppError(error, "Failed to change the allowance");
}

/** `through` null = until a parent resumes; `message` null = none (stored as null). */
export async function pauseSchedule(
  db: Client,
  args: { scheduleId: string; through: string | null; message: string | null },
): Promise<void> {
  const { error } = await db.rpc("pause_allowance", {
    p_schedule_id: args.scheduleId,
    // The function accepts null (pause until resumed); generated types mark every arg non-null.
    p_through: args.through as string,
    p_message: args.message ?? "",
  });
  if (error) throw toAppError(error, "Failed to pause the allowance");
}

export async function resumeSchedule(db: Client, scheduleId: string): Promise<void> {
  const { error } = await db.rpc("resume_allowance", { p_schedule_id: scheduleId });
  if (error) throw toAppError(error, "Failed to resume the allowance");
}

export async function stopSchedule(db: Client, scheduleId: string): Promise<void> {
  const { error } = await db.rpc("stop_allowance", { p_schedule_id: scheduleId });
  if (error) throw toAppError(error, "Failed to stop the allowance");
}

/** `note` null is sent as "" (the function stores a blank note as null). */
export async function insertGift(
  db: Client,
  args: { childId: string; amountMinor: number; giveOn: string; note: string | null },
): Promise<string> {
  const { data, error } = await db.rpc("create_gift", {
    p_child_id: args.childId,
    p_amount_minor: args.amountMinor,
    p_give_on: args.giveOn,
    p_note: args.note ?? "",
  });
  if (error) throw toAppError(error, "Failed to save the gift");
  return data;
}

export async function changeGift(
  db: Client,
  args: { giftId: string; amountMinor: number; giveOn: string; note: string | null },
): Promise<void> {
  const { error } = await db.rpc("update_gift", {
    p_gift_id: args.giftId,
    p_amount_minor: args.amountMinor,
    p_give_on: args.giveOn,
    p_note: args.note ?? "",
  });
  if (error) throw toAppError(error, "Failed to save the gift");
}

export async function cancelPendingGift(db: Client, giftId: string): Promise<void> {
  const { error } = await db.rpc("cancel_gift", { p_gift_id: giftId });
  if (error) throw toAppError(error, "Failed to cancel the gift");
}

type HandoverArgs = { id: string; cashMinor: number; savedMinor: number; idempotencyKey: string };

/** `not_given`: the occurrence was marked not given, so nothing was recorded. */
export async function confirmOccurrenceHandover(
  db: Client,
  args: HandoverArgs,
): Promise<HandoverResult | "not_given"> {
  const { data, error } = await db.rpc("confirm_handover", {
    p_occurrence_id: args.id,
    p_cash_minor: args.cashMinor,
    p_saved_minor: args.savedMinor,
    p_idempotency_key: args.idempotencyKey,
  });
  if (error) throw toAppError(error, "Failed to record the handover");
  return oneOf(
    data,
    ["confirmed", "already_confirmed", "not_given"],
    "Failed to record the handover",
  );
}

/** `cancelled`: the gift was cancelled, so nothing was recorded. */
export async function confirmGiftHandover(
  db: Client,
  args: HandoverArgs,
): Promise<HandoverResult | "cancelled"> {
  const { data, error } = await db.rpc("confirm_gift_handover", {
    p_gift_id: args.id,
    p_cash_minor: args.cashMinor,
    p_saved_minor: args.savedMinor,
    p_idempotency_key: args.idempotencyKey,
  });
  if (error) throw toAppError(error, "Failed to record the handover");
  return oneOf(
    data,
    ["confirmed", "already_confirmed", "cancelled"],
    "Failed to record the handover",
  );
}

export async function closeOccurrence(db: Client, occurrenceId: string): Promise<NotGivenResult> {
  const { data, error } = await db.rpc("mark_not_given", { p_occurrence_id: occurrenceId });
  if (error) throw toAppError(error, "Failed to mark as not given");
  return oneOf(data, ["closed", "already_handled"], "Failed to mark as not given");
}
