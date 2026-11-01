"use server";

import { refresh } from "next/cache";
import { getFamilyContext } from "@/features/allowance/server";
import { pushAfterNotices } from "@/features/notifications/server";
import { createAction } from "@/lib";
import { entryIdSchema, fixSchema, receivedSchema, undoSchema } from "../schemas";
import {
  correctDiaryEntry,
  listEntryVersions,
  recordMoneyReceived,
  undoDiaryEntry,
} from "./service";

export const recordMoneyReceivedAction = createAction(
  async () => receivedSchema((await getFamilyContext()).currency),
  async (input) => {
    const result = await recordMoneyReceived(input);
    pushAfterNotices();
    refresh();
    return result;
  },
);

export const undoDiaryEntryAction = createAction(undoSchema, async ({ entryId }) => {
  const result = await undoDiaryEntry(entryId);
  pushAfterNotices();
  refresh();
  return result;
});

export const correctDiaryEntryAction = createAction(
  async () => fixSchema((await getFamilyContext()).currency),
  async (input) => {
    const result = await correctDiaryEntry(input);
    pushAfterNotices();
    refresh();
    return result;
  },
);

export const listEntryVersionsAction = createAction(entryIdSchema, async ({ entryId }) => {
  return listEntryVersions(entryId);
});
