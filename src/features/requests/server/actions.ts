"use server";

import { refresh } from "next/cache";
import { getFamilyContext } from "@/features/allowance/server";
import { createAction } from "@/lib";
import {
  completeSchema,
  decideSchema,
  depositSchema,
  rejectDepositSchema,
  requestIdSchema,
  withdrawalSchema,
} from "../schemas";
import {
  cancelRequest,
  completeRequest,
  createDeposit,
  createWithdrawal,
  decideWithdrawal,
  rejectDeposit,
} from "./service";

export const createWithdrawalAction = createAction(
  async () => withdrawalSchema((await getFamilyContext()).currency),
  async (input) => {
    const result = await createWithdrawal(input);
    refresh();
    return result;
  },
);

export const createDepositAction = createAction(
  async () => depositSchema((await getFamilyContext()).currency),
  async (input) => {
    const result = await createDeposit(input);
    refresh();
    return result;
  },
);

export const decideWithdrawalAction = createAction(decideSchema, async (input) => {
  const result = await decideWithdrawal(input);
  refresh();
  return result;
});

export const rejectDepositAction = createAction(rejectDepositSchema, async (input) => {
  const result = await rejectDeposit(input);
  refresh();
  return result;
});

export const completeRequestAction = createAction(completeSchema, async (input) => {
  const result = await completeRequest(input);
  refresh();
  return result;
});

export const cancelRequestAction = createAction(requestIdSchema, async (input) => {
  const result = await cancelRequest(input);
  refresh();
  return result;
});
