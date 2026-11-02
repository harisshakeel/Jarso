import "server-only";
import type {
  EntryVersion,
  FixResult,
  PurchaseResult,
  ReceivedResult,
  UndoResult,
} from "@jarso/core/diary";
// Spending and money received, recorded in the money diary.
import { assertUser } from "@/features/auth/server";
import { assertRole } from "@/features/family/server";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import {
  callCorrectDiaryEntry,
  callListEntryVersions,
  callRecordMoneyReceived,
  callRecordPurchase,
  callUndoDiaryEntry,
} from "./repository";

/** Records a purchase for the signed-in child. `not_enough_spend` is a result, not an error. */
export async function recordPurchase(input: {
  amountMinor: number;
  category: string;
  label?: string;
  idempotencyKey: string;
  occurredAt?: string;
}): Promise<PurchaseResult> {
  const { user } = await assertRole("child");
  return callRecordPurchase(await createClient(), {
    childId: user.id,
    amountMinor: input.amountMinor,
    category: input.category,
    label: input.label ?? "",
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt,
  });
}

/** Writes down money the child got, into Spend or Save. No request and no rule applies. */
export async function recordMoneyReceived(input: {
  amountMinor: number;
  jar: "spend" | "save";
  category: string;
  label?: string;
  idempotencyKey: string;
}): Promise<ReceivedResult> {
  const { user } = await assertRole("child");
  return callRecordMoneyReceived(await createClient(), {
    childId: user.id,
    amountMinor: input.amountMinor,
    jar: input.jar,
    category: input.category,
    label: input.label ?? "",
    idempotencyKey: input.idempotencyKey,
  });
}

/** Undoes a purchase or money received within a day. Later than that is a CONFLICT. */
export async function undoDiaryEntry(entryId: string): Promise<UndoResult> {
  await assertUser();
  // Ownership is enforced by the SQL function (RLS-style check on the entry).
  const result = await callUndoDiaryEntry(await createClient(), entryId);
  if (result === "too_late") {
    throw new AppError("CONFLICT", "You can only undo within a day.");
  }
  return result;
}

/** Fixes the amount, category or name of the child's own line. Refusals are results. */
export async function correctDiaryEntry(input: {
  entryId: string;
  amountMinor: number;
  category: string;
  label?: string;
  idempotencyKey: string;
}): Promise<FixResult> {
  await assertRole("child");
  return callCorrectDiaryEntry(await createClient(), {
    entryId: input.entryId,
    amountMinor: input.amountMinor,
    category: input.category,
    label: input.label ?? "",
    idempotencyKey: input.idempotencyKey,
  });
}

/** The earlier versions of a fixed line, newest first. SQL checks the line is the caller's. */
export async function listEntryVersions(entryId: string): Promise<EntryVersion[]> {
  await assertUser();
  return callListEntryVersions(await createClient(), entryId);
}
