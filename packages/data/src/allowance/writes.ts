import {
  allowanceErrors,
  type Frequency,
  type HandoverResult,
  type NotGivenResult,
} from "@jarso/core/allowance";
import { AppError, isAppError } from "@jarso/core/lib";
import {
  type Client,
  cancelPendingGift,
  changeGift,
  changeSchedule,
  closeOccurrence,
  confirmGiftHandover,
  confirmOccurrenceHandover,
  findGift,
  findScheduleState,
  insertGift,
  insertSchedule,
  pauseSchedule,
  resumeSchedule,
  stopSchedule,
} from "./repository";

/**
 * Parent allowance, gift and handover writes. No auth here: the caller checks it is a parent of
 * the row's child first (web services, or the phone through RLS), and each database function
 * re-checks the caller. Errors carry the lines a parent reads.
 */

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
// Schedule writes
// ---------------------------------------------------------------------------

/** `saveMinor` is the planned Save (ADR 0019); null or missing sets no plan. */
export async function createAllowance(
  db: Client,
  input: {
    childId: string;
    amountMinor: number;
    frequency: Frequency;
    firstOn: string;
    saveMinor?: number | null;
  },
): Promise<string> {
  return conflictAs(insertSchedule(db, input), allowanceErrors.alreadyExists);
}

/**
 * The schema already checks the amount and how often, so the database refusing a change as
 * invalid (22023) is about the next date: put it on that field.
 */
export async function changeAllowance(
  db: Client,
  input: {
    scheduleId: string;
    amountMinor: number;
    frequency: Frequency;
    nextOn: string;
    saveMinor?: number | null;
  },
): Promise<void> {
  try {
    await conflictAs(changeSchedule(db, input), allowanceErrors.stopped);
  } catch (error) {
    if (isAppError(error) && error.code === "VALIDATION") {
      throw new AppError("VALIDATION", allowanceErrors.nextOn, {
        fieldErrors: { nextOn: [allowanceErrors.nextOn] },
        cause: error,
      });
    }
    throw error;
  }
}

export async function pauseAllowance(
  db: Client,
  input: { scheduleId: string; through: string | null; message: string | null },
): Promise<void> {
  await unlessReached(
    pauseSchedule(db, input),
    async () => {
      const state = await findScheduleState(db, input.scheduleId);
      return state?.status === "paused" && state.pausedThrough === input.through;
    },
    allowanceErrors.notRunning,
  );
}

export async function resumeAllowance(db: Client, scheduleId: string): Promise<void> {
  await unlessReached(
    resumeSchedule(db, scheduleId),
    async () => (await findScheduleState(db, scheduleId))?.status === "active",
    allowanceErrors.notPaused,
  );
}

export async function stopAllowance(db: Client, scheduleId: string): Promise<void> {
  await unlessReached(
    stopSchedule(db, scheduleId),
    async () => (await findScheduleState(db, scheduleId))?.status === "stopped",
    allowanceErrors.alreadyStopped,
  );
}

// ---------------------------------------------------------------------------
// Gift writes
// ---------------------------------------------------------------------------

/** A repeated key from the same parent returns the gift it already made. */
export async function createGift(
  db: Client,
  input: {
    childId: string;
    amountMinor: number;
    giveOn: string;
    note: string | null;
    idempotencyKey: string;
  },
): Promise<string> {
  return insertGift(db, input);
}

/** A due gift may keep its past date; a changed date must be `today` (family-local) or later. */
export async function updateGift(
  db: Client,
  input: { giftId: string; amountMinor: number; giveOn: string; note: string | null },
  today: string,
): Promise<void> {
  const gift = await findGift(db, input.giftId);
  if (gift && input.giveOn !== gift.giveOn && input.giveOn < today) {
    throw new AppError("VALIDATION", "Please fix the highlighted fields.", {
      fieldErrors: { giveOn: [allowanceErrors.giftDatePast] },
    });
  }
  await conflictAs(changeGift(db, input), allowanceErrors.giftDone);
}

export async function cancelGift(db: Client, giftId: string): Promise<void> {
  await unlessReached(
    cancelPendingGift(db, giftId),
    async () => (await findGift(db, giftId))?.status === "cancelled",
    allowanceErrors.giftDone,
  );
}

// ---------------------------------------------------------------------------
// Handover
// ---------------------------------------------------------------------------

/**
 * Records what the parent handed over: cash to Spend, the rest to Save. Exactly once in the
 * database; a repeat (any key) returns `already_confirmed`, which the UI shows as success.
 * An occurrence marked not given, or a cancelled gift, is a CONFLICT: nothing was recorded,
 * and a parent confirming from a stale screen must be told so.
 */
export async function confirmHandover(
  db: Client,
  input: {
    kind: "allowance" | "gift";
    id: string;
    cashMinor: number;
    savedMinor: number;
    idempotencyKey: string;
  },
): Promise<HandoverResult> {
  const { kind, ...args } = input;
  if (kind === "allowance") {
    const result = await confirmOccurrenceHandover(db, args);
    if (result === "not_given") throw new AppError("CONFLICT", allowanceErrors.notGiven);
    return result;
  }
  const result = await conflictAs(confirmGiftHandover(db, args), allowanceErrors.giftNotDue);
  if (result === "cancelled") throw new AppError("CONFLICT", allowanceErrors.giftCancelled);
  return result;
}

/** Closes a due allowance without paying it. `already_handled` if it was already handled. */
export async function markNotGiven(db: Client, occurrenceId: string): Promise<NotGivenResult> {
  return closeOccurrence(db, occurrenceId);
}
