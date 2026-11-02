import "server-only";
// Only place that knows the purchase functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import type { EntryVersion, FixResult, PurchaseResult, ReceivedResult, UndoResult } from "../types";

type Client = SupabaseClient<Database>;

export async function callRecordPurchase(
  db: Client,
  input: {
    childId: string;
    amountMinor: number;
    category: string;
    label: string;
    idempotencyKey: string;
    occurredAt?: string;
  },
): Promise<PurchaseResult> {
  const { data, error } = await db.rpc("record_purchase", {
    p_child_id: input.childId,
    p_amount_minor: input.amountMinor,
    p_category: input.category,
    p_label: input.label,
    p_idempotency_key: input.idempotencyKey,
    // Omitted when online: the function's default null means now().
    p_occurred_at: input.occurredAt,
  });
  if (error) throw toAppError(error, "Failed to record the purchase");
  const result = data as { status?: string; entry_id?: string; free_minor?: number } | null;
  if (result?.status === "recorded" && typeof result.entry_id === "string") {
    return { status: "recorded", entryId: result.entry_id };
  }
  if (result?.status === "not_enough_spend") {
    return { status: "not_enough_spend", freeMinor: Number(result.free_minor ?? 0) };
  }
  throw new AppError("INTERNAL", "Failed to record the purchase", { cause: { result } });
}

export async function callRecordMoneyReceived(
  db: Client,
  input: {
    childId: string;
    amountMinor: number;
    jar: "spend" | "save";
    category: string;
    label: string;
    idempotencyKey: string;
  },
): Promise<ReceivedResult> {
  const { data, error } = await db.rpc("record_money_received", {
    p_child_id: input.childId,
    p_amount_minor: input.amountMinor,
    p_jar: input.jar,
    p_category: input.category,
    p_label: input.label,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toAppError(error, "Failed to record the money");
  const result = data as { status?: string; entry_id?: string } | null;
  if (result?.status === "recorded" && typeof result.entry_id === "string") {
    return { status: "recorded", entryId: result.entry_id };
  }
  throw new AppError("INTERNAL", "Failed to record the money", { cause: { result } });
}

const UNDO_RESULTS: readonly string[] = [
  "undone",
  "already_undone",
  "too_late",
  "not_enough_spend",
  "not_enough_save",
];

export async function callUndoDiaryEntry(db: Client, entryId: string): Promise<UndoResult> {
  const { data, error } = await db.rpc("undo_diary_entry", { p_entry_id: entryId });
  if (error) throw toAppError(error, "Failed to undo this");
  if (typeof data === "string" && UNDO_RESULTS.includes(data)) return data as UndoResult;
  throw new AppError("INTERNAL", "Failed to undo this", { cause: { result: data } });
}

export async function callCorrectDiaryEntry(
  db: Client,
  input: {
    entryId: string;
    amountMinor: number;
    category: string;
    label: string;
    idempotencyKey: string;
  },
): Promise<FixResult> {
  const { data, error } = await db.rpc("correct_diary_entry", {
    p_entry_id: input.entryId,
    p_amount_minor: input.amountMinor,
    p_category: input.category,
    p_label: input.label,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw toAppError(error, "Failed to fix this");
  const result = data as { status?: string; entry_id?: string; free_minor?: number } | null;
  switch (result?.status) {
    case "fixed":
      if (typeof result.entry_id === "string") {
        return { status: "fixed", entryId: result.entry_id };
      }
      break;
    case "unchanged":
    case "not_fixable":
    case "not_enough_save":
      return { status: result.status };
    case "not_enough_spend":
      return { status: "not_enough_spend", freeMinor: Number(result.free_minor ?? 0) };
  }
  throw new AppError("INTERNAL", "Failed to fix this", { cause: { result } });
}

export async function callListEntryVersions(db: Client, entryId: string): Promise<EntryVersion[]> {
  const { data, error } = await db.rpc("list_entry_versions", { p_entry_id: entryId });
  if (error) throw toAppError(error, "Failed to load the earlier versions");
  return (data ?? []).map((row) => ({
    id: row.id,
    amountMinor: Number(row.amount_minor),
    category: row.category,
    label: row.label,
    createdAt: row.created_at,
  }));
}
