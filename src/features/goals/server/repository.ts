import "server-only";
// Only place that knows the goals table and its functions.
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import type { Goal, GoalInput } from "../types";

type Client = SupabaseClient<Database>;

const COLUMNS = "id, name, emoji, target_minor, plan_minor, reached_at, celebrated_at";

const PLAN_MESSAGES: Record<string, string> = {
  plan_over_allowance: "That's more than your allowance. Try a smaller amount.",
  plan_over_target: "That's more than your goal costs. Try a smaller amount.",
};

export async function findActiveGoal(db: Client, childId: string): Promise<Goal | null> {
  const { data, error } = await db
    .from("goals")
    .select(COLUMNS)
    .eq("child_id", childId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw toAppError(error, "We couldn't load your goal.");
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    emoji: data.emoji,
    targetMinor: Number(data.target_minor),
    planMinor: data.plan_minor === null ? null : Number(data.plan_minor),
    reachedAt: data.reached_at,
    celebratedAt: data.celebrated_at,
  };
}

/** Counted Save for the active goal; also records the first time it is reached. */
export async function callGoalProgress(
  db: Client,
  childId: string,
): Promise<{ goalId: string; countedMinor: number } | null> {
  const { data, error } = await db.rpc("goal_progress", { p_child_id: childId });
  if (error) throw toAppError(error, "We couldn't load your goal.");
  const row = data?.[0];
  return row ? { goalId: row.goal_id, countedMinor: Number(row.counted_minor) } : null;
}

export async function callSaveGoal(db: Client, input: GoalInput): Promise<string> {
  const { data, error } = await db.rpc("save_goal", {
    p_name: input.name,
    p_emoji: input.emoji,
    p_target_minor: input.targetMinor,
    // The generated type says number; the function takes null for "no plan".
    p_plan_minor: input.planMinor as number,
  });
  if (error) {
    const key = error.code === "22023" ? error.message : undefined;
    // Own keys only, as in db-error.ts.
    const plan = key && Object.hasOwn(PLAN_MESSAGES, key) ? PLAN_MESSAGES[key] : undefined;
    if (plan)
      throw new AppError("VALIDATION", plan, { fieldErrors: { plan: [plan] }, cause: error });
    throw toAppError(error, "We couldn't save your goal.");
  }
  return data;
}

export async function callArchiveGoal(db: Client, goalId: string): Promise<void> {
  const { error } = await db.rpc("archive_goal", { p_goal_id: goalId });
  if (error) throw toAppError(error, "We couldn't start a new goal.");
}

export async function callMarkCelebrated(db: Client, goalId: string): Promise<void> {
  const { error } = await db.rpc("mark_goal_celebrated", { p_goal_id: goalId });
  if (error) throw toAppError(error, "We couldn't save that.");
}
