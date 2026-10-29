import "server-only";
import { assertUser } from "@/features/auth/server";
import { assertRole } from "@/features/family/server";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import type { PurchaseResult, UndoResult } from "../types";
import { callRecordPurchase, callUndoPurchase } from "./repository";

/** Spending recorded in the money diary. */

/** Records a purchase for the signed-in child. `not_enough_spend` is a result, not an error. */
export async function recordPurchase(input: {
  amountMinor: number;
  label?: string;
  idempotencyKey: string;
}): Promise<PurchaseResult> {
  const { user } = await assertRole("child");
  return callRecordPurchase(await createClient(), {
    childId: user.id,
    amountMinor: input.amountMinor,
    label: input.label ?? "",
    idempotencyKey: input.idempotencyKey,
  });
}

/** Undoes a purchase within a day. Later than that is a CONFLICT. */
export async function undoPurchase(entryId: string): Promise<UndoResult> {
  await assertUser();
  const result = await callUndoPurchase(await createClient(), entryId);
  if (result === "too_late") {
    throw new AppError("CONFLICT", "You can only undo a purchase within a day.");
  }
  return result;
}
