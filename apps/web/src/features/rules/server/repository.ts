import "server-only";
import type { JarMovesMode, Period, RuleKind } from "@jarso/core/rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toAppError } from "@/lib";
import type { Database } from "@/types";

// Reads live in `@jarso/data/rules`; this is where the rule writes live.
export { findChildRules } from "@jarso/data/rules";

type Client = SupabaseClient<Database>;

/** `amountMinor` null clears the rule. */
export async function saveMoneyRule(
  db: Client,
  input: { childId: string; kind: RuleKind; period: Period; amountMinor: number | null },
): Promise<void> {
  const { error } = await db.rpc("set_money_rule", {
    p_child_id: input.childId,
    p_kind: input.kind,
    p_period: input.period,
    // The function takes null to clear the rule; the generated type omits nullability.
    p_amount_minor: input.amountMinor as number,
  });
  if (error) throw toAppError(error, "Failed to save the rule");
}

export async function saveJarMovesApproval(
  db: Client,
  childId: string,
  mode: JarMovesMode,
): Promise<void> {
  const { error } = await db.rpc("set_jar_moves_approval", { p_child_id: childId, p_mode: mode });
  if (error) throw toAppError(error, "Failed to save the setting");
}

export async function saveAllowNegativeSpend(
  db: Client,
  childId: string,
  allowed: boolean,
): Promise<void> {
  const { error } = await db.rpc("set_allow_negative_spend", {
    p_child_id: childId,
    p_allowed: allowed,
  });
  if (error) throw toAppError(error, "Failed to save the setting");
}
