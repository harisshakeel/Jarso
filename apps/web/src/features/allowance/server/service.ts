import "server-only";
import type {
  DueItem,
  Frequency,
  Gift,
  HandoverResult,
  NotGivenResult,
  Schedule,
  Split,
} from "@jarso/core/allowance";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertUser } from "@/features/auth/server";
import {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  assertSelfOrParentOf,
  getFamily,
} from "@/features/family/server";
import { AppError, familyToday, isAppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types";
import {
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
  findLatestConfirmedOccurrence,
  findLatestGiftSplit,
  findLatestSchedule,
  findOccurrenceChildId,
  findScheduleChildId,
  findScheduleState,
  insertGift,
  insertSchedule,
  listDueForParent,
  listPendingGifts,
  markPlanDecided,
  pauseSchedule,
  resumeSchedule,
  stopSchedule,
  sumDueOccurrences,
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

/**
 * Like `conflictAs`, but a CONFLICT because the target is already where this call takes it
 * counts as done: on a slow network the first try can commit and lose only its reply, so the
 * repeat finds the work done. Any other state is still the CONFLICT `message`.
 */
async function unlessReached(
  work: Promise<void>,
  reached: () => Promise<boolean>,
  message: string,
): Promise<void> {
  try {
    await work;
  } catch (error) {
    if (!isAppError(error) || error.code !== "CONFLICT") throw error;
    if (await reached().catch(() => false)) return;
    throw new AppError("CONFLICT", message, { cause: error });
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The child's latest schedule (a stopped one too, so it can say so), or null. Child or parent. */
export async function getSchedule(childId: string): Promise<Schedule | null> {
  const user = await assertSelfOrParentOf(childId);
  const db = await createClient();
  const row = await findLatestSchedule(db, childId);
  if (!row) return null;
  const nextDueOn = row.status === "stopped" ? null : await fetchNextDueOn(db, row.id);
  // Payment state is the parent's: the child never sees whether a card pays their allowance,
  // and the database hides those columns from them.
  if (user.id === childId) {
    return {
      ...row,
      autoCharge: false,
      autoChargeProvider: null,
      autoChargeMine: false,
      nextDueOn,
    };
  }
  const { autoChargeBy, ...autoCharge } = await fetchScheduleAutoCharge(db, row.id);
  return { ...row, ...autoCharge, autoChargeMine: autoChargeBy === user.id, nextDueOn };
}

/**
 * Allowances waiting for a parent (total and count). Child or parent. Allowances only: pending
 * gifts stay secret until handed over.
 */
export async function listDueForChild(
  childId: string,
): Promise<{ totalMinor: number; count: number }> {
  await assertSelfOrParentOf(childId);
  return sumDueOccurrences(await createClient(), childId);
}

/** An allowance handed over today (family time), for the allowance-day plan. */
export type TodaysAllowance = {
  occurrenceId: string;
  cashMinor: number;
  savedMinor: number;
  confirmedAt: string;
  /** The child already took or dismissed the plan for it: the card offers nothing new. */
  planDecided: boolean;
};

/**
 * The allowance that landed today, for the allowance-day plan on the child's Home: null when the
 * latest handover was another day or nothing went to Spend. A decided plan still comes back
 * (flagged), so the card that was just used stays on screen to say what happened. Child or parent.
 */
export async function getTodaysAllowance(childId: string): Promise<TodaysAllowance | null> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const [occurrence, family] = await Promise.all([
    findLatestConfirmedOccurrence(db, childId),
    getFamily(),
  ]);
  if (!occurrence || occurrence.cashMinor <= 0) return null;
  const timezone = family?.timezone ?? "UTC";
  if (localDate(occurrence.confirmedAt, timezone) !== familyToday(timezone)) return null;
  return {
    occurrenceId: occurrence.id,
    cashMinor: occurrence.cashMinor,
    savedMinor: occurrence.savedMinor,
    confirmedAt: occurrence.confirmedAt,
    planDecided: occurrence.planDecidedAt !== null,
  };
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

/** The child took or dismissed the plan for one of their allowances; the card stops showing. */
export async function decideAllowancePlan(occurrenceId: string): Promise<void> {
  await assertRole("child");
  await markPlanDecided(await createClient(), occurrenceId);
}

/** Due allowances and due gifts, oldest first. Parent only: it reveals pending gifts. */
export async function listDue(childId: string): Promise<DueItem[]> {
  await assertParentCanRead(childId);
  return listDueForParent(await createClient(), childId);
}

/** Gifts not handed over yet (due and future), soonest first. Parent only. */
export async function listGifts(childId: string): Promise<Gift[]> {
  const user = await assertParentCanRead(childId);
  const gifts = await listPendingGifts(await createClient(), childId);
  return gifts.map(({ autoChargeBy, ...gift }) => ({
    ...gift,
    autoChargeMine: autoChargeBy === user.id,
  }));
}

/** The split of the child's most recent handover (allowance or gift), for the prefill. */
export async function getLastSplit(childId: string): Promise<Split | null> {
  await assertParentCanRead(childId);
  return getLastSplitWith(await createClient(), childId);
}

/**
 * The newer of the child's last allowance and last gift split, read with `db`. No auth: the
 * caller authorises, or passes the admin client from a trusted job (the auto charge).
 */
export async function getLastSplitWith(
  db: SupabaseClient<Database>,
  childId: string,
): Promise<Split | null> {
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

const NEXT_ON = "Pick a later date: after the last allowance, after any pause, and within a year.";

/**
 * The schema already checks the amount and how often, so the database refusing a change as
 * invalid (22023) is about the next date: put it on that field.
 */
export async function changeAllowance(input: {
  scheduleId: string;
  amountMinor: number;
  frequency: Frequency;
  nextOn: string;
}): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, input.scheduleId));
  try {
    await conflictAs(changeSchedule(db, input), "This allowance has stopped. Set up a new one.");
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION") {
      throw new AppError("VALIDATION", NEXT_ON, {
        fieldErrors: { nextOn: [NEXT_ON] },
        cause: error,
      });
    }
    throw error;
  }
}

export async function pauseAllowance(input: {
  scheduleId: string;
  through: string | null;
  message: string | null;
}): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, input.scheduleId));
  await unlessReached(
    pauseSchedule(db, input),
    async () => {
      const state = await findScheduleState(db, input.scheduleId);
      return state?.status === "paused" && state.pausedThrough === input.through;
    },
    "This allowance isn't running, so it can't pause.",
  );
}

export async function resumeAllowance(scheduleId: string): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, scheduleId));
  await unlessReached(
    resumeSchedule(db, scheduleId),
    async () => (await findScheduleState(db, scheduleId))?.status === "active",
    "This allowance isn't paused.",
  );
}

export async function stopAllowance(scheduleId: string): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, scheduleId));
  await unlessReached(
    stopSchedule(db, scheduleId),
    async () => (await findScheduleState(db, scheduleId))?.status === "stopped",
    "This allowance has already stopped.",
  );
}

// ---------------------------------------------------------------------------
// Gift writes
// ---------------------------------------------------------------------------

const GIFT_DONE = "This gift was already handed over or cancelled.";

/** A repeated key from the same parent returns the gift it already made. */
export async function createGift(input: {
  childId: string;
  amountMinor: number;
  giveOn: string;
  note: string | null;
  idempotencyKey: string;
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
  await unlessReached(
    cancelPendingGift(db, giftId),
    async () => (await findGift(db, giftId))?.status === "cancelled",
    GIFT_DONE,
  );
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

const NOT_GIVEN = "This allowance was marked as not given, so nothing was recorded.";
const GIFT_CANCELLED = "This gift was cancelled, so nothing was recorded.";

/**
 * Records what the parent handed over: cash to Spend, the rest to Save. Exactly once in the
 * database; a repeat (any key) returns `already_confirmed`, which the UI shows as success.
 * An occurrence marked not given, or a cancelled gift, is a CONFLICT: nothing was recorded,
 * and a parent confirming from a stale screen must be told so.
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
    const result = await confirmOccurrenceHandover(db, args);
    if (result === "not_given") throw new AppError("CONFLICT", NOT_GIVEN);
    return result;
  }
  await assertParentOfChild((await findGift(db, args.id))?.childId);
  const result = await conflictAs(confirmGiftHandover(db, args), "This gift isn't due yet.");
  if (result === "cancelled") throw new AppError("CONFLICT", GIFT_CANCELLED);
  return result;
}

/** Closes a due allowance without paying it. `already_handled` if it was already handled. */
export async function markNotGiven(occurrenceId: string): Promise<NotGivenResult> {
  const db = await createClient();
  await assertParentOfChild(await findOccurrenceChildId(db, occurrenceId));
  return closeOccurrence(db, occurrenceId);
}
