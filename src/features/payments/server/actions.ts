"use server";

import type { Route } from "next";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getFamilyContext } from "@/features/allowance/server";
import { createAction } from "@/lib";
import { autoChargeSchema, cancelCardPaymentSchema, cardPaymentSchema } from "../schemas";
import { cancelCardPayment, removeSavedCard, setAutoCharge, startCardPayment } from "./service";

/**
 * A URL result goes to the provider's hosted page with `redirect()`, which `createAction` lets
 * through (cast: the hosted page is off-app, so not a typed route). The card-payment amount is per item, so `startCardPayment` checks the full total.
 */

export const startCardPaymentAction = createAction(
  async () => cardPaymentSchema((await getFamilyContext()).currency),
  async (input) => {
    const { redirectUrl } = await startCardPayment(input);
    redirect(redirectUrl as Route);
  },
);

/** No refresh here: the caller replaces the URL (dropping `?card=`), which re-renders the page. */
export const cancelCardPaymentAction = createAction(
  cancelCardPaymentSchema,
  async ({ childId, kind, id }) => {
    await cancelCardPayment(childId, {
      type: kind === "allowance" ? "occurrence" : "parent_gift",
      id,
    });
  },
);

export const setAutoChargeAction = createAction(autoChargeSchema, async (input) => {
  const { redirectUrl } = await setAutoCharge(input);
  if (redirectUrl) redirect(redirectUrl as Route);
  refresh();
});

export const removeSavedCardAction = createAction(z.object({}), async () => {
  await removeSavedCard();
  refresh();
});
