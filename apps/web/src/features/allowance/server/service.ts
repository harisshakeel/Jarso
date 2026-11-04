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
import { MATCH_GIFT_NOTE } from "@jarso/core/allowance";
import * as shared from "@jarso/data/allowance";
import { type FamilyContext, getFamilyContext as getSharedFamilyContext } from "@jarso/data/family";
import { assertUser } from "@/features/auth/server";
import {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  assertSelfOrParentOf,
  getFamily,
} from "@/features/family/server";
import { AppError, familyToday } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import {
  fetchNextDueOn,
  findGift,
  findLatestConfirmedOccurrence,
  findOccurrenceChildId,
  findScheduleChildId,
  findScheduleRow,
  listDueForParent,
  markPlanDecided,
  sumDueOccurrences,
} from "./repository";

/**
 * Allowance schedules, parent gifts and handover. Every parent mutation resolves the row's child
 * (an RLS read) and calls `assertParentOf` before the shared write in `@jarso/data/allowance`,
 * whose database function re-checks.
 */

const FORBIDDEN = "You can't do that.";

export type { FamilyContext };

/** The signed-in user's family currency and local today, for schemas and default dates. */
export async function getFamilyContext(): Promise<FamilyContext> {
  const user = await assertUser();
  return getSharedFamilyContext(await createClient(), user.id);
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

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The child's latest schedule (a stopped one too, so it can say so), or null. Child or parent. */
export async function getSchedule(childId: string): Promise<Schedule | null> {
  const user = await assertSelfOrParentOf(childId);
  const db = await createClient();
  if (user.id !== childId) return shared.getParentSchedule(db, childId, user.id);
  // Payment state is the parent's: the child never sees whether a card pays their allowance,
  // and the database hides those columns from them.
  const row = await findScheduleRow(db, childId);
  if (!row) return null;
  const nextDueOn = row.status === "stopped" ? null : await fetchNextDueOn(db, row.id);
  return { ...row, autoCharge: false, autoChargeProvider: null, autoChargeMine: false, nextDueOn };
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
  return shared.listGiftsFor(await createClient(), childId, user.id);
}

/** The split of the child's most recent handover (allowance or gift), for the prefill. */
export async function getLastSplit(childId: string): Promise<Split | null> {
  await assertParentCanRead(childId);
  return shared.getLastSplitWith(await createClient(), childId);
}

/**
 * The newer of the child's last allowance and last gift split, read with `db`. No auth: the
 * caller authorises, or passes the admin client from a trusted job (the auto charge).
 */
export const getLastSplitWith = shared.getLastSplitWith;

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
  return shared.createAllowance(await createClient(), input);
}

export async function changeAllowance(input: {
  scheduleId: string;
  amountMinor: number;
  frequency: Frequency;
  nextOn: string;
}): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, input.scheduleId));
  await shared.changeAllowance(db, input);
}

export async function pauseAllowance(input: {
  scheduleId: string;
  through: string | null;
  message: string | null;
}): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, input.scheduleId));
  await shared.pauseAllowance(db, input);
}

export async function resumeAllowance(scheduleId: string): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, scheduleId));
  await shared.resumeAllowance(db, scheduleId);
}

export async function stopAllowance(scheduleId: string): Promise<void> {
  const db = await createClient();
  await assertParentOfChild(await findScheduleChildId(db, scheduleId));
  await shared.stopAllowance(db, scheduleId);
}

// ---------------------------------------------------------------------------
// Gift writes
// ---------------------------------------------------------------------------

/** A repeated key from the same parent returns the gift it already made. */
export async function createGift(input: {
  childId: string;
  amountMinor: number;
  giveOn: string;
  note: string | null;
  idempotencyKey: string;
}): Promise<string> {
  await assertParentOf(input.childId);
  return shared.createGift(await createClient(), input);
}

/** A due gift may keep its past date; a changed date must be today or later. */
export async function updateGift(input: {
  giftId: string;
  amountMinor: number;
  giveOn: string;
  note: string | null;
}): Promise<void> {
  const db = await createClient();
  await assertParentOfChild((await findGift(db, input.giftId))?.childId);
  const { today } = await getFamilyContext();
  await shared.updateGift(db, input, today);
}

export async function cancelGift(giftId: string): Promise<void> {
  const db = await createClient();
  await assertParentOfChild((await findGift(db, giftId))?.childId);
  await shared.cancelGift(db, giftId);
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

/**
 * Records what the parent handed over: cash to Spend, the rest to Save. A repeat returns
 * `already_confirmed`; a not-given allowance or a cancelled gift is a CONFLICT (shared write).
 */
export async function confirmHandover(input: {
  kind: "allowance" | "gift";
  id: string;
  cashMinor: number;
  savedMinor: number;
  idempotencyKey: string;
}): Promise<HandoverResult> {
  const db = await createClient();
  const childId =
    input.kind === "allowance"
      ? await findOccurrenceChildId(db, input.id)
      : (await findGift(db, input.id))?.childId;
  await assertParentOfChild(childId);
  return shared.confirmHandover(db, input);
}

/** Closes a due allowance without paying it. `already_handled` if it was already handled. */
export async function markNotGiven(occurrenceId: string): Promise<NotGivenResult> {
  const db = await createClient();
  await assertParentOfChild(await findOccurrenceChildId(db, occurrenceId));
  return shared.markNotGiven(db, occurrenceId);
}

/**
 * Match their saving (parent dashboard, spec answer 8): a gift of `amountMinor` given today and
 * handed over at once, all of it into Save. The same key makes one gift; the handover happens
 * once in the database whatever its key, so a retry after a lost response adds nothing twice.
 */
export async function matchSaving(input: {
  childId: string;
  amountMinor: number;
  idempotencyKey: string;
}): Promise<HandoverResult> {
  const { today } = await getFamilyContext();
  const giftId = await createGift({
    childId: input.childId,
    amountMinor: input.amountMinor,
    giveOn: today,
    note: MATCH_GIFT_NOTE,
    idempotencyKey: input.idempotencyKey,
  });
  return confirmHandover({
    kind: "gift",
    id: giftId,
    cashMinor: 0,
    savedMinor: input.amountMinor,
    idempotencyKey: crypto.randomUUID(),
  });
}
