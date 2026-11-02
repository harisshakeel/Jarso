import "server-only";
import type { ChildRules, JarMovesMode, Period, RuleKind } from "@jarso/core/rules";
// Money rules and the overspend setting. Reads: the child or a parent. Writes: a parent.
import { assertParentOf, assertSelfOrParentOf } from "@/features/family/server";
import { createClient } from "@/lib/supabase/server";
import {
  findChildRules,
  saveAllowNegativeSpend,
  saveJarMovesApproval,
  saveMoneyRule,
} from "./repository";

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

/** Ask first (a request waits for the parent) or just tell them (recorded at once, with a note). */
export async function setJarMovesApproval(input: {
  childId: string;
  mode: JarMovesMode;
}): Promise<void> {
  await assertParentOf(input.childId);
  await saveJarMovesApproval(await createClient(), input.childId, input.mode);
}

export async function setOverspend(input: { childId: string; allowed: boolean }): Promise<void> {
  await assertParentOf(input.childId);
  await saveAllowNegativeSpend(await createClient(), input.childId, input.allowed);
}
