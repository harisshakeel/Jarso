import "server-only";
import { cache } from "react";
import { assertUser } from "@/features/auth/server";
// Savings requests: a child asks to take money out of Save or records money put into it.
import {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  assertSelfOrParentOf,
} from "@/features/family/server";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import type {
  Availability,
  CancelResult,
  CompleteResult,
  DecideDepositResult,
  DecideWithdrawalResult,
  DepositResult,
  EmergencyResult,
  SavingsRequest,
  WithdrawalResult,
} from "../types";
import {
  callCancel,
  callComplete,
  callCreateDeposit,
  callCreateEmergency,
  callCreateWithdrawal,
  callDecideDeposit,
  callDecideWithdrawal,
  fetchBalances,
  fetchCapRemaining,
  findRequestChildId,
  listOpenRequests,
  listRequestsFor,
} from "./repository";

const CHANGED = "This request changed. Refresh to see where it is.";

/** The child a request belongs to. A request that is missing or not yours is forbidden. */
async function childOf(requestId: string): Promise<string> {
  const childId = await findRequestChildId(await createClient(), requestId);
  if (!childId) throw new AppError("FORBIDDEN", "You can't do that.");
  return childId;
}

/** Jar balances, what is promised, and how much more the child may take out right now. */
export const getAvailability = cache(async (childId: string): Promise<Availability> => {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const [balances, capRemaining] = await Promise.all([
    fetchBalances(db, childId),
    fetchCapRemaining(db, childId),
  ]);
  return {
    ...balances,
    takeOutLimitMinor:
      capRemaining === null ? null : Math.min(balances.availableSaveMinor, capRemaining),
  };
});

/** A child's requests, newest first. The child or a parent. */
export const listRequests = cache(async (childId: string): Promise<SavingsRequest[]> => {
  await assertSelfOrParentOf(childId);
  return listRequestsFor(await createClient(), childId);
});

/** Pending and approved withdrawals and pending deposits. Parent only; a read, so it works behind the profile dialog. */
export async function listRequestsNeedingParent(childId: string): Promise<SavingsRequest[]> {
  await assertParentCanRead(childId);
  return listOpenRequests(await createClient(), childId);
}

/** Over-cap and over-available are results to show, not errors. */
export async function createWithdrawal(input: {
  amountMinor: number;
  reason?: string;
  idempotencyKey: string;
}): Promise<WithdrawalResult> {
  const { user } = await assertRole("child");
  return callCreateWithdrawal(await createClient(), {
    childId: user.id,
    amountMinor: input.amountMinor,
    reason: input.reason ?? "",
    idempotencyKey: input.idempotencyKey,
  });
}

/** The child asks for extra money (FR15). Always pending: a parent decides on the reason. */
export async function createEmergency(input: {
  amountMinor: number;
  reason: string;
  idempotencyKey: string;
}): Promise<EmergencyResult> {
  const { user } = await assertRole("child");
  return callCreateEmergency(await createClient(), {
    childId: user.id,
    amountMinor: input.amountMinor,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function createDeposit(input: {
  amountMinor: number;
  idempotencyKey: string;
}): Promise<DepositResult> {
  const { user } = await assertRole("child");
  return callCreateDeposit(await createClient(), {
    childId: user.id,
    amountMinor: input.amountMinor,
    idempotencyKey: input.idempotencyKey,
  });
}

/** Approves or rejects a pending withdrawal or emergency ask (the same database function). */
export async function decideWithdrawal(input: {
  requestId: string;
  approve: boolean;
  note?: string;
}): Promise<DecideWithdrawalResult> {
  await assertParentOf(await childOf(input.requestId));
  return callDecideWithdrawal(await createClient(), {
    requestId: input.requestId,
    approve: input.approve,
    note: input.note ?? "",
  });
}

/** A parent can only turn a deposit down; the rest confirms itself or waits. */
export async function rejectDeposit(input: {
  requestId: string;
  note?: string;
}): Promise<DecideDepositResult> {
  await assertParentOf(await childOf(input.requestId));
  return callDecideDeposit(await createClient(), {
    requestId: input.requestId,
    note: input.note ?? "",
  });
}

/** Hands over an approved withdrawal or emergency, or confirms a pending deposit. `already_completed` is a success. */
export async function completeRequest(input: {
  requestId: string;
  idempotencyKey: string;
}): Promise<Extract<CompleteResult, "completed" | "already_completed">> {
  await assertParentOf(await childOf(input.requestId));
  const result = await callComplete(await createClient(), input);
  if (result === "not_approved" || result === "over_available") {
    throw new AppError("CONFLICT", CHANGED);
  }
  return result;
}

/** The child or a parent with a finished profile. `already_closed` is a success. */
export async function cancelRequest(input: { requestId: string }): Promise<CancelResult> {
  const childId = await childOf(input.requestId);
  const user = await assertUser();
  if (user.id !== childId) await assertParentOf(childId);
  return callCancel(await createClient(), input.requestId);
}
