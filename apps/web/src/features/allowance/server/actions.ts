"use server";

import {
  allowanceSchema,
  changeAllowanceSchema,
  giftSchema,
  handoverSchema,
  idSchema,
  matchSavingSchema,
  pauseSchema,
  updateGiftSchema,
} from "@jarso/core/allowance";
import { refresh } from "next/cache";
import { pushAfterNotices, sendChildNote } from "@/features/notifications/server";
import { createAction, logger } from "@/lib";
import {
  cancelGift,
  changeAllowance,
  confirmHandover,
  createAllowance,
  createGift,
  getFamilyContext,
  markNotGiven,
  matchSaving,
  pauseAllowance,
  resumeAllowance,
  stopAllowance,
  updateGift,
} from "./service";

/**
 * One action per mutation. Money schemas need the family currency and dates the family's today,
 * so those schemas are built per request. Each refreshes the current route after the write.
 */

export const createAllowanceAction = createAction(
  async () => {
    const { currency, today } = await getFamilyContext();
    return allowanceSchema(currency, today);
  },
  async (input) => {
    const id = await createAllowance(input);
    refresh();
    return id;
  },
);

export const changeAllowanceAction = createAction(
  async () => {
    const { currency, today } = await getFamilyContext();
    return changeAllowanceSchema(currency, today);
  },
  async (input) => {
    await changeAllowance(input);
    refresh();
  },
);

export const pauseAllowanceAction = createAction(
  async () => pauseSchema((await getFamilyContext()).today),
  async (input) => {
    await pauseAllowance(input);
    refresh();
  },
);

export const resumeAllowanceAction = createAction(idSchema, async ({ id }) => {
  await resumeAllowance(id);
  refresh();
});

export const stopAllowanceAction = createAction(idSchema, async ({ id }) => {
  await stopAllowance(id);
  refresh();
});

export const createGiftAction = createAction(
  async () => {
    const { currency, today } = await getFamilyContext();
    return giftSchema(currency, today);
  },
  async (input) => {
    const id = await createGift(input);
    refresh();
    return id;
  },
);

export const updateGiftAction = createAction(
  async () => {
    const { currency, today } = await getFamilyContext();
    return updateGiftSchema(currency, today);
  },
  async (input) => {
    await updateGift(input);
    refresh();
  },
);

export const cancelGiftAction = createAction(idSchema, async ({ id }) => {
  await cancelGift(id);
  refresh();
});

/** The form sends `idempotencyKey`, made once per mount with `crypto.randomUUID()`. */
export const confirmHandoverAction = createAction(
  async () => handoverSchema((await getFamilyContext()).currency),
  async (input) => {
    const result = await confirmHandover(input);
    refresh();
    return result;
  },
);

export const markNotGivenAction = createAction(idSchema, async ({ id }) => {
  const result = await markNotGiven(id);
  refresh();
  return result;
});

/**
 * Match their saving: the money goes into Save at once, then the parent's note (if any) goes to
 * the child's News. The note is a nice-to-have: if it fails, the money is still in, and the
 * parent is told the note didn't go.
 */
export const matchSavingAction = createAction(
  async () => matchSavingSchema((await getFamilyContext()).currency),
  async ({ message, ...input }) => {
    const result = await matchSaving(input);
    let noted = false;
    if (message) {
      try {
        await sendChildNote({
          childId: input.childId,
          text: message,
          idempotencyKey: input.idempotencyKey,
        });
        noted = true;
        pushAfterNotices();
      } catch (error) {
        logger.warn("Match note not sent", {
          error: error instanceof Error ? error.name : typeof error,
        });
      }
    }
    refresh();
    return { result, noted };
  },
);
