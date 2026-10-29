import "server-only";
import { assertParentOf, assertSelfOrParentOf } from "@/features/family/server";
import { createClient } from "@/lib/supabase/server";
import type { ChildRules, Period, RuleKind } from "../types";
import { findChildRules, saveAllowNegativeSpend, saveMoneyRule } from "./repository";

/** Money rules and the overspend setting. Reads: the child or a parent. Writes: a parent. */

export async function getChildRules(childId: string): Promise<ChildRules> {
  await assertSelfOrParentOf(childId);
  return findChildRules(await createClient(), childId);
}

/** `amountMinor` null switches the rule off. */
export async function setRule(input: {
  childId: string;
  kind: RuleKind;
  period: Period;
  amountMinor: number | null;
}): Promise<void> {
  await assertParentOf(input.childId);
  await saveMoneyRule(await createClient(), input);
}

export async function setOverspend(input: { childId: string; allowed: boolean }): Promise<void> {
  await assertParentOf(input.childId);
  await saveAllowNegativeSpend(await createClient(), input.childId, input.allowed);
}
