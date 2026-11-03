import { AppError, toAppError } from "@jarso/core/lib";
import {
  type ChildRules,
  type JarMovesMode,
  jarMovesModes,
  type MoneyRule,
  type Period,
  periods,
  type RuleKind,
  ruleKinds,
} from "@jarso/core/rules";
import type { Database } from "@jarso/db";
// Reads the money-rule and child-settings tables; writes go through the parent-only functions.
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

function oneOf<const T extends string>(value: string, allowed: readonly T[]): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new AppError("INTERNAL", "Failed to load rules", { cause: { value } });
}

export async function findChildRules(db: Client, childId: string): Promise<ChildRules> {
  const [rules, settings] = await Promise.all([
    db.from("money_rules").select("kind, period, amount_minor").eq("child_id", childId),
    db
      .from("child_settings")
      .select("allow_negative_spend, jar_moves_approval")
      .eq("child_id", childId)
      .maybeSingle(),
  ]);
  if (rules.error) throw toAppError(rules.error, "Failed to load rules");
  if (settings.error) throw toAppError(settings.error, "Failed to load rules");
  return {
    allowNegativeSpend: settings.data?.allow_negative_spend ?? false,
    jarMovesApproval: settings.data
      ? oneOf(settings.data.jar_moves_approval, jarMovesModes)
      : "ask",
    rules: rules.data.map(
      (row): MoneyRule => ({
        kind: oneOf(row.kind, ruleKinds),
        period: oneOf(row.period, periods),
        amountMinor: Number(row.amount_minor),
      }),
    ),
  };
}

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
