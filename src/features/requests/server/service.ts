import "server-only";
// Savings requests: a child asks to take money out of Save or records money put into it.
import {
  assertParentOf,
  assertRole,
  assertSelfOrParentOf,
  getFamily,
} from "@/features/family/server";
import { getChildRules } from "@/features/rules/server";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import type {
  Availability,
  CancelResult,
  CompleteResult,
  DecideDepositResult,
  DecideWithdrawalResult,
  DepositResult,
  SavingsRequest,
  WithdrawalResult,
} from "../types";
import { windowStart } from "../window";
import {
  callCancel,
  callComplete,
  callCreateDeposit,
  callCreateWithdrawal,
  callDecideDeposit,
  callDecideWithdrawal,
  fetchBalances,
  findRequestChildId,
  listOpenRequests,
  listRequestsFor,
  sumWithdrawalsSince,
} from "./repository";

const CHANGED = "This request changed. Refresh to see where it is.";

/** The child a request belongs to. A request that is missing or not yours is forbidden. */
async function childOf(requestId: string): Promise<string> {
  const childId = await findRequestChildId(await createClient(), requestId);
  if (!childId) throw new AppError("FORBIDDEN", "You can't do that.");
  return childId;
}

/** Jar balances, what is promised, and how much more the child may take out right now. */
export async function getAvailability(childId: string): Promise<Availability> {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const [balances, { rules }, family] = await Promise.all([
    fetchBalances(db, childId),
    getChildRules(childId),
    getFamily(),
  ]);
  const timezone = family?.timezone ?? "UTC";
  const now = new Date();

  const remaining = await Promise.all(
    rules
      .filter((rule) => rule.kind === "withdrawal_cap")
      .map(async (rule) => {
        // A per-time cap has no running total.
        const since = windowStart(rule.period, timezone, now);
        const used = rule.period === "item" ? 0 : await sumWithdrawalsSince(db, childId, since);
        return Math.max(0, rule.amountMinor - used);
      }),
  );
  return {
    ...balances,
    takeOutLimitMinor: remaining.length
      ? Math.min(balances.availableSaveMinor, ...remaining)
      : null,
  };
}

/** A child's requests, newest first. The child or a parent. */
export async function listRequests(childId: string): Promise<SavingsRequest[]> {
  await assertSelfOrParentOf(childId);
  return listRequestsFor(await createClient(), childId);
}

/** Pending and approved withdrawals and pending deposits. Parent only. */
export async function listRequestsNeedingParent(childId: string): Promise<SavingsRequest[]> {
  await assertParentOf(childId);
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

/** Hands an approved withdrawal over. `already_completed` is a success. */
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

/** The child or a parent. `already_closed` is a success. */
export async function cancelRequest(input: { requestId: string }): Promise<CancelResult> {
  await assertSelfOrParentOf(await childOf(input.requestId));
  return callCancel(await createClient(), input.requestId);
}
