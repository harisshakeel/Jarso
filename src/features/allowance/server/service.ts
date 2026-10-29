import "server-only";
import { assertUser } from "@/features/auth/server";
import {
  assertParentOf,
  assertRole,
  assertSelfOrParentOf,
  getFamily,
} from "@/features/family/server";
import { AppError, isAppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import { familyToday } from "../schemas";
import type {
  DueItem,
  Frequency,
  Gift,
  HandoverResult,
  NotGivenResult,
  Schedule,
  Split,
} from "../types";
import {
  cancelPendingGift,
  changeGift,
  changeSchedule,
  closeOccurrence,
  confirmGiftHandover,
  confirmOccurrenceHandover,
  fetchNextDueOn,
  findGift,
  findLatestAllowanceSplit,
  findLatestGiftSplit,
  findLatestSchedule,
  findOccurrenceChildId,
  findScheduleChildId,
  insertGift,
  insertSchedule,
  listDueForParent,
  listPendingGifts,
  pauseSchedule,
  resumeSchedule,
  stopSchedule,
} from "./repository";

/**
 * Allowance schedules, parent gifts and handover. Every parent mutation resolves the row's child
 * (an RLS read) and calls `assertParentOf` before the database function, which re-checks.
 */

const FORBIDDEN = "You can't do that.";

export type FamilyContext = { currency: string; timezone: string; today: string };

/** The signed-in user's family currency and local today, for schemas and default dates. */
export async function getFamilyContext(): Promise<FamilyContext> {
  await assertUser();
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "Set up your family first.");
  return {
    currency: family.currency,
    timezone: family.timezone,
    today: familyToday(family.timezone),
  };
}

/**
 * Checks the caller is a parent of a row's child, read through RLS. A missing or invisible row
 * is FORBIDDEN (UNAUTHORIZED when signed out), like the database functions.
 */
async function assertParentOfChild(childId: string | null | undefined): Promise<void> {
  if (childId) {
    await assertParentOf(childId);
    return;
  }
  await assertRole("parent");
  throw new AppError("FORBIDDEN", FORBIDDEN);
}

/** Gives a database CONFLICT (JA409) a message that fits the operation. */
async function conflictAs<T>(work: Promise<T>, message: string): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (isAppError(error) && error.code === "CONFLICT") {
      throw new AppError("CONFLICT", message, { cause: error });
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The child's latest schedule (a stopped one too, so it can say so), or null. Child or parent. */
export async function getSchedule(childId: string): Promise<Schedule | null> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const row = await findLatestSchedule(db, childId);
  if (!row) return null;
  const nextDueOn = row.status === "stopped" ? null : await fetchNextDueOn(db, row.id);
  return { ...row, nextDueOn };
}

/** Due allowances and due gifts, oldest first. Parent only: it reveals pending gifts. */
export async function listDue(childId: string): Promise<DueItem[]> {
  await assertParentOf(childId);
  return listDueForParent(await createClient(), childId);
}

/** Gifts not handed over yet (due and future), soonest first. Parent only. */
export async function listGifts(childId: string): Promise<Gift[]> {
  await assertParentOf(childId);
  return listPendingGifts(await createClient(), childId);
}

/** The split of the child's most recent handover (allowance or gift), for the prefill. */
export async function getLastSplit(childId: string): Promise<Split | null> {
  await assertParentOf(childId);
  const db = await createClient();
  const [allowance, gift] = await Promise.all([
    findLatestAllowanceSplit(db, childId),
    findLatestGiftSplit(db, childId),
  ]);
  const latest =
    allowance && gift
      ? Date.parse(gift.at) > Date.parse(allowance.at)
        ? gift
        : allowance
      : (allowance ?? gift);
  return latest ? { cash: latest.cash, saved: latest.saved } : null;
}

// ---------------------------------------------------------------------------
// Schedule writes
// ---------------------------------------------------------------------------

export async function createAllowance(input: {
  childId: string;
  amountMinor: number;
  frequency: Frequency;
  firstOn: string;
}): Promise<string> {
  await assertParentOf(input.childId);
  return conflictAs(
    insertSchedule(await createClient(), input),
    "There's already an allowance. Change it instead.",
  );
}

export async function changeAllowance(input: {
  scheduleId: string;
  amountMinor: number;
  frequency: Frequency;
  nextOn: string;
}): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, input.scheduleId));
  await conflictAs(changeSchedule(db, input), "This allowance has stopped. Set up a new one.");
}

export async function pauseAllowance(input: {
  scheduleId: string;
  through: string | null;
  message: string | null;
}): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, input.scheduleId));
  await conflictAs(pauseSchedule(db, input), "This allowance isn't running, so it can't pause.");
}

export async function resumeAllowance(scheduleId: string): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, scheduleId));
  await conflictAs(resumeSchedule(db, scheduleId), "This allowance isn't paused.");
}

export async function stopAllowance(scheduleId: string): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, scheduleId));
  await conflictAs(stopSchedule(db, scheduleId), "This allowance has already stopped.");
}

// ---------------------------------------------------------------------------
// Gift writes
// ---------------------------------------------------------------------------

const GIFT_DONE = "This gift was already handed over or cancelled.";

export async function createGift(input: {
  childId: string;
  amountMinor: number;
  giveOn: string;
  note: string | null;
}): Promise<string> {
  await assertParentOf(input.childId);
  return insertGift(await createClient(), input);
}

/** A due gift may keep its past date; a changed date must be today or later. */
export async function updateGift(input: {
  giftId: string;
  amountMinor: number;
  giveOn: string;
  note: string | null;
}): Promise<void> {
  const db = await createClient();
  const gift = await findGift(db, input.giftId);
  await assertParentOfChild(gift?.childId);
  if (gift && input.giveOn !== gift.giveOn) {
    const { today } = await getFamilyContext();
    if (input.giveOn < today) {
      throw new AppError("VALIDATION", "Please fix the highlighted fields.", {
        fieldErrors: { giveOn: ["Pick today or a later date."] },
      });
    }
  }
  await conflictAs(changeGift(db, input), GIFT_DONE);
}

export async function cancelGift(giftId: string): Promise<void> {
  const db = await createClient();
  await assertParentOfChild((await findGift(db, giftId))?.childId);
  await conflictAs(cancelPendingGift(db, giftId), GIFT_DONE);
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

/**
 * Records what the parent handed over: cash to Spend, the rest to Save. Exactly once in the
 * database; a repeat (any key) returns `already_confirmed`, which the UI shows as success.
 */
export async function confirmHandover(input: {
  kind: "allowance" | "gift";
  id: string;
  cashMinor: number;
  savedMinor: number;
  idempotencyKey: string;
}): Promise<HandoverResult> {
  const db = await createClient();
  const { kind, ...args } = input;
  if (kind === "allowance") {
    await assertParentOfChild(await findOccurrenceChildId(db, args.id));
    return confirmOccurrenceHandover(db, args);
  }
  await assertParentOfChild((await findGift(db, args.id))?.childId);
  return conflictAs(confirmGiftHandover(db, args), "This gift isn't due yet.");
}

/** Closes a due allowance without paying it. `already_handled` if it was already handled. */
export async function markNotGiven(occurrenceId: string): Promise<NotGivenResult> {
  const db = await createClient();
  await assertParentOfChild(await findOccurrenceChildId(db, occurrenceId));
  return closeOccurrence(db, occurrenceId);
}
