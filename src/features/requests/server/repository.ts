import "server-only";
// Only place that knows the requests table and its functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import {
  type CancelResult,
  type CapPeriod,
  type CompleteResult,
  type DecideDepositResult,
  type DecideWithdrawalResult,
  type DepositResult,
  type RequestKind,
  type RequestStatus,
  requestStatuses,
  type SavingsRequest,
  type WithdrawalResult,
} from "../types";

type Client = SupabaseClient<Database>;

const COLUMNS = "id, kind, status, amount_minor, reason, auto, occurred_at";
const LIST_LIMIT = 50;

type Json = Record<string, unknown> | null;

function unexpected(message: string, result: unknown): AppError {
  return new AppError("INTERNAL", message, { cause: { result } });
}

function isPeriod(value: unknown): value is CapPeriod {
  return value === "item" || value === "week" || value === "month";
}

export type Balances = {
  spendMinor: number;
  saveMinor: number;
  reservedSaveMinor: number;
  heldSpendMinor: number;
  availableSaveMinor: number;
  availableSpendMinor: number;
};

export async function fetchBalances(db: Client, childId: string): Promise<Balances> {
  const args = { p_child_id: childId };
  const [spend, save, reserved, held, availSave, availSpend] = await Promise.all([
    db.rpc("balance", { ...args, p_jar: "spend" }),
    db.rpc("balance", { ...args, p_jar: "save" }),
    db.rpc("reserved_save", args),
    db.rpc("held_spend", args),
    db.rpc("available_save", args),
    db.rpc("available_spend", args),
  ]);
  for (const res of [spend, save, reserved, held, availSave, availSpend]) {
    if (res.error) throw toAppError(res.error, "Failed to load your jars");
  }
  return {
    spendMinor: Number(spend.data ?? 0),
    saveMinor: Number(save.data ?? 0),
    reservedSaveMinor: Number(reserved.data ?? 0),
    heldSpendMinor: Number(held.data ?? 0),
    availableSaveMinor: Number(availSave.data ?? 0),
    availableSpendMinor: Number(availSpend.data ?? 0),
  };
}

/** Smallest remaining withdrawal cap, or null when the child has none. */
export async function fetchCapRemaining(db: Client, childId: string): Promise<number | null> {
  const { data, error } = await db.rpc("withdrawal_cap_remaining", { p_child_id: childId });
  if (error) throw toAppError(error, "Failed to load your limits");
  return data === null || data === undefined ? null : Number(data);
}

function toRequest(row: {
  id: string;
  kind: string;
  status: string;
  amount_minor: number;
  reason: string | null;
  auto: boolean;
  occurred_at: string;
}): SavingsRequest {
  const status = requestStatuses.find((s) => s === row.status);
  if ((row.kind !== "withdrawal" && row.kind !== "deposit") || !status) {
    throw unexpected("Failed to load your requests", row);
  }
  return {
    id: row.id,
    kind: row.kind as RequestKind,
    status: status as RequestStatus,
    amountMinor: Number(row.amount_minor),
    reason: row.reason,
    auto: row.auto,
    occurredAt: row.occurred_at,
  };
}

/**
 * A child's requests, newest first: every open one (they still reserve money, so none may be
 * hidden) plus the most recent closed ones up to the limit.
 */
export async function listRequestsFor(db: Client, childId: string): Promise<SavingsRequest[]> {
  const [open, closed] = await Promise.all([
    db
      .from("requests")
      .select(COLUMNS)
      .eq("child_id", childId)
      .in("status", ["pending", "approved"])
      .order("occurred_at", { ascending: false }),
    db
      .from("requests")
      .select(COLUMNS)
      .eq("child_id", childId)
      .not("status", "in", "(pending,approved)")
      .order("occurred_at", { ascending: false })
      .limit(LIST_LIMIT),
  ]);
  if (open.error) throw toAppError(open.error, "Failed to load your requests");
  if (closed.error) throw toAppError(closed.error, "Failed to load your requests");
  return [...open.data, ...closed.data]
    .sort((a, b) => Date.parse(b.occurred_at) - Date.parse(a.occurred_at))
    .map(toRequest);
}

/** What a parent has to act on: pending and approved withdrawals, pending deposits. */
export async function listOpenRequests(db: Client, childId: string): Promise<SavingsRequest[]> {
  const { data, error } = await db
    .from("requests")
    .select(COLUMNS)
    .eq("child_id", childId)
    .or(
      "and(kind.eq.withdrawal,status.in.(pending,approved)),and(kind.eq.deposit,status.eq.pending)",
    )
    .order("occurred_at", { ascending: true })
    .limit(LIST_LIMIT);
  if (error) throw toAppError(error, "Failed to load requests");
  return data.map(toRequest);
}

/** The child a request belongs to (RLS hides other families' requests), or null. */
export async function findRequestChildId(db: Client, requestId: string): Promise<string | null> {
  const { data, error } = await db
    .from("requests")
    .select("child_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the request");
  return data?.child_id ?? null;
}

export async function callCreateWithdrawal(
  db: Client,
  input: { childId: string; amountMinor: number; reason: string; idempotencyKey: string },
): Promise<WithdrawalResult> {
  const { data, error } = await db.rpc("create_withdrawal", {
    p_child_id: input.childId,
    p_amount_minor: input.amountMinor,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toAppError(error, "Failed to send your request");
  const r = data as Json;
  if ((r?.status === "pending" || r?.status === "approved") && typeof r.request_id === "string") {
    return { status: r.status, requestId: r.request_id };
  }
  // A retried key whose request has since moved on: the ask was already sent.
  if (
    (r?.status === "handed_over" || r?.status === "rejected" || r?.status === "cancelled") &&
    typeof r.request_id === "string"
  ) {
    return { status: "already_sent", requestId: r.request_id };
  }
  if (r?.status === "over_available") {
    return { status: "over_available", availableMinor: Number(r.available_minor ?? 0) };
  }
  if (r?.status === "over_cap" && isPeriod(r.period)) {
    return {
      status: "over_cap",
      period: r.period,
      capMinor: Number(r.cap_minor ?? 0),
      usedMinor: Number(r.used_minor ?? 0),
    };
  }
  throw unexpected("Failed to send your request", r);
}

export async function callCreateDeposit(
  db: Client,
  input: { childId: string; amountMinor: number; idempotencyKey: string },
): Promise<DepositResult> {
  const { data, error } = await db.rpc("create_deposit", {
    p_child_id: input.childId,
    p_amount_minor: input.amountMinor,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toAppError(error, "Failed to record your deposit");
  const r = data as Json;
  if ((r?.status === "pending" || r?.status === "confirmed") && typeof r.request_id === "string") {
    return { status: r.status, requestId: r.request_id };
  }
  if ((r?.status === "rejected" || r?.status === "cancelled") && typeof r.request_id === "string") {
    return { status: "already_sent", requestId: r.request_id };
  }
  if (r?.status === "over_available") {
    return { status: "over_available", availableMinor: Number(r.available_minor ?? 0) };
  }
  throw unexpected("Failed to record your deposit", r);
}

export async function callDecideWithdrawal(
  db: Client,
  input: { requestId: string; approve: boolean; note: string },
): Promise<DecideWithdrawalResult> {
  const { data, error } = await db.rpc("decide_withdrawal", {
    p_request_id: input.requestId,
    p_approve: input.approve,
    p_note: input.note,
  });
  if (error) throw toAppError(error, "Failed to save your decision");
  if (
    data === "approved" ||
    data === "rejected" ||
    data === "already_decided" ||
    data === "over_available"
  ) {
    return data;
  }
  throw unexpected("Failed to save your decision", data);
}

export async function callDecideDeposit(
  db: Client,
  input: { requestId: string; note: string },
): Promise<DecideDepositResult> {
  const { data, error } = await db.rpc("decide_deposit", {
    p_request_id: input.requestId,
    p_note: input.note,
  });
  if (error) throw toAppError(error, "Failed to save your decision");
  if (data === "rejected" || data === "already_decided") return data;
  throw unexpected("Failed to save your decision", data);
}

export async function callComplete(
  db: Client,
  input: { requestId: string; idempotencyKey: string },
): Promise<CompleteResult> {
  const { data, error } = await db.rpc("complete_request", {
    p_request_id: input.requestId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toAppError(error, "Failed to record the handover");
  if (
    data === "completed" ||
    data === "already_completed" ||
    data === "not_approved" ||
    data === "over_available"
  ) {
    return data;
  }
  throw unexpected("Failed to record the handover", data);
}

export async function callCancel(db: Client, requestId: string): Promise<CancelResult> {
  const { data, error } = await db.rpc("cancel_request", { p_request_id: requestId });
  if (error) throw toAppError(error, "Failed to cancel the request");
  if (data === "cancelled" || data === "already_closed") return data;
  throw unexpected("Failed to cancel the request", data);
}
