"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { routes } from "@/config";
import { createAction } from "@/lib";
import { markReadSchema, pushEndpointSchema, pushSubscriptionSchema } from "../schemas";
import { markRead, ownsPushEndpoint, subscribePush, unsubscribePush } from "./service";

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
