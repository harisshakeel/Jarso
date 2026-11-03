"use server";

import {
  childNoteSchema,
  markReadSchema,
  pushEndpointSchema,
  pushSubscriptionSchema,
} from "@jarso/core/notifications";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { routes } from "@/config";
import { createAction } from "@/lib";
import { pushAfterNotices } from "./push";
import {
  markRead,
  ownsPushEndpoint,
  sendChildNote,
  subscribePush,
  unsubscribePush,
} from "./service";

export const markNoticesReadAction = createAction(markReadSchema, async ({ ids }) => {
  const changed = await markRead(ids);
  revalidatePath(routes.childInbox);
  revalidatePath(routes.parentInbox);
  return { changed };
});

/** Web push (FR16): the browser's subscription, after the user allowed notifications. */
export const subscribePushAction = createAction(pushSubscriptionSchema, async (input) => {
  const userAgent = (await headers()).get("user-agent");
  return subscribePush(input, userAgent);
});

export const unsubscribePushAction = createAction(pushEndpointSchema, async ({ endpoint }) =>
  unsubscribePush(endpoint),
);

export const pushOwnedAction = createAction(pushEndpointSchema, async ({ endpoint }) =>
  ownsPushEndpoint(endpoint),
);

/** A parent's note to their child; the child's devices get a push when push is on. */
export const sendChildNoteAction = createAction(childNoteSchema, async (input) => {
  const status = await sendChildNote(input);
  pushAfterNotices();
  return { status };
});
