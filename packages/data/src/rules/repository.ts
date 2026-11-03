import { AppError, toAppError } from "@jarso/core/lib";
import {
  type ChildRules,
  jarMovesModes,
  type MoneyRule,
  periods,
  ruleKinds,
} from "@jarso/core/rules";
import type { Database } from "@jarso/db";
// Reads the money-rule and child-settings tables.
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
