"use server";

import { refresh } from "next/cache";
import { createAction } from "@/lib";
import { askGuideSchema, rateGuideMessageSchema, setGuideAccessSchema } from "../schemas";
import { askGuide, rateGuideMessage, setGuideAccess } from "./service";

/** The child's guide sheet calls these with plain objects; it keeps the chat in its own state. */
export const askGuideAction = createAction(askGuideSchema, (input) => askGuide(input));

export const rateGuideMessageAction = createAction(
  rateGuideMessageSchema,
  ({ messageId, rating }) => rateGuideMessage(messageId, rating),
);

/** The parent's switch. Refreshes so the child's page and the chat list show the change. */
export const setGuideAccessAction = createAction(
  setGuideAccessSchema,
  async ({ childId, enabled }) => {
    await setGuideAccess(childId, enabled);
    refresh();
  },
);
