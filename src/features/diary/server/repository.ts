import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import type { PurchaseResult, UndoResult } from "../types";

type Client = SupabaseClient<Database>;

/** Only place that knows the purchase functions. */

export async function callRecordPurchase(
  db: Client,
  input: { childId: string; amountMinor: number; label: string; idempotencyKey: string },
): Promise<PurchaseResult> {
  const { data, error } = await db.rpc("record_purchase", {
    p_child_id: input.childId,
    p_amount_minor: input.amountMinor,
    p_label: input.label,
    p_idempotency_key: input.idempotencyKey,
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

export async function callUndoPurchase(db: Client, entryId: string): Promise<UndoResult> {
  const { data, error } = await db.rpc("undo_purchase", { p_entry_id: entryId });
  if (error) throw toAppError(error, "Failed to undo the purchase");
  if (data === "undone" || data === "already_undone" || data === "too_late") return data;
  throw new AppError("INTERNAL", "Failed to undo the purchase", { cause: { result: data } });
}
