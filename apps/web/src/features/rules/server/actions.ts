"use server";

import { overspendSchema, setRuleSchema } from "@jarso/core/rules";
import { refresh } from "next/cache";
import { getFamilyContext } from "@/features/allowance/server";
import { createAction } from "@/lib";
import { setOverspend, setRule } from "./service";

export const setRuleAction = createAction(
  async () => setRuleSchema((await getFamilyContext()).currency),
  async (input) => {
    await setRule(input);
    refresh();
  },
);

export const setOverspendAction = createAction(overspendSchema, async (input) => {
  await setOverspend(input);
  refresh();
});
