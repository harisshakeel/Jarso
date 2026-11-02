"use server";

import {
  acceptGoalProposalSchema,
  askGuideSchema,
  forgetMemorySchema,
  rateGuideMessageSchema,
  readPriceSchema,
  setGuideAccessSchema,
} from "@jarso/core/guide";
import { refresh, revalidatePath } from "next/cache";
import { routes } from "@/config";
import { createAction } from "@/lib";
import {
  acceptGoalProposal,
  askGuide,
  forgetMemory,
  rateGuideMessage,
  readPriceFromPhoto,
  setGuideAccess,
} from "./service";

/** The child's guide sheet calls these with plain objects; it keeps the chat in its own state. */
export const askGuideAction = createAction(askGuideSchema, (input) => askGuide(input));

export const rateGuideMessageAction = createAction(
  rateGuideMessageSchema,
  ({ messageId, rating }) => rateGuideMessage(messageId, rating),
);

/** The child or a parent forgets one of Jarso's memories. */
export const forgetMemoryAction = createAction(forgetMemorySchema, async ({ memoryId }) => {
  await forgetMemory(memoryId);
  refresh();
});

/**
 * The child tapped "Make it my goal" on a card under Jarso's reply. Jarso only offered it; this
 * saves it through the goals service. No refresh of the chat page: the card shows the outcome,
 * and Home and the goal page read the new goal on their next visit.
 */
export const acceptGoalProposalAction = createAction(acceptGoalProposalSchema, async (input) => {
  const result = await acceptGoalProposal(input);
  if (result.status === "saved") {
    revalidatePath(routes.child);
    revalidatePath(routes.childGoal);
  }
  return result;
});

/** The photo price check: a shrunk photo of a price tag or receipt in, a question for Jarso out. */
export const readPriceFromPhotoAction = createAction(readPriceSchema, ({ image }) =>
  readPriceFromPhoto(image),
);

/** The parent's switch. Refreshes so the child's page and the chat list show the change. */
export const setGuideAccessAction = createAction(
  setGuideAccessSchema,
  async ({ childId, enabled }) => {
    await setGuideAccess(childId, enabled);
    refresh();
  },
);
