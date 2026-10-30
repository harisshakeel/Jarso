"use server";

import { refresh } from "next/cache";
import { createAction } from "@/lib";
import { undoSchema } from "../schemas";
import { undoPurchase } from "./service";

export const undoPurchaseAction = createAction(undoSchema, async ({ entryId }) => {
  const result = await undoPurchase(entryId);
  refresh();
  return result;
});
