"use server";

import { refresh } from "next/cache";
import { createAction } from "@/lib";
import {
  askGuideSchema,
  forgetMemorySchema,
  rateGuideMessageSchema,
  setGuideAccessSchema,
} from "../schemas";
import { askGuide, forgetMemory, rateGuideMessage, setGuideAccess } from "./service";

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

/** The parent's switch. Refreshes so the child's page and the chat list show the change. */
export const setGuideAccessAction = createAction(
  setGuideAccessSchema,
  async ({ childId, enabled }) => {
    await setGuideAccess(childId, enabled);
    refresh();
  },
);
