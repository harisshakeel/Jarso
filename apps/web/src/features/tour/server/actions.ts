"use server";

import { saveTourSchema } from "@jarso/core/tour";
import { createAction } from "@/lib";
import { saveMyTour } from "./service";

/** The tour saves quietly in the background: the buddy when picked, and the end or a skip. */
export const saveTourAction = createAction(saveTourSchema, async (input) => {
  await saveMyTour(input);
});
