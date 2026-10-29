"use server";

import { refresh } from "next/cache";
import { getFamilyContext } from "@/features/allowance/server";
import { createAction } from "@/lib";
import { purchaseSchema, undoSchema } from "../schemas";
import { recordPurchase, undoPurchase } from "./service";

export const recordPurchaseAction = createAction(
  async () => purchaseSchema((await getFamilyContext()).currency),
  async (input) => {
    const result = await recordPurchase(input);
    if (result.status === "recorded") refresh();
    return result;
  },
);

export const undoPurchaseAction = createAction(undoSchema, async ({ entryId }) => {
  const result = await undoPurchase(entryId);
  refresh();
  return result;
});
