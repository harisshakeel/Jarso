// Only place that knows the progress functions.
import { AppError, toAppError } from "@jarso/core/lib";
import type { JarsoLook } from "@jarso/core/mascot";
import { type CheckinAnswer, type Progress, progressSchema } from "@jarso/core/progress";
import type { Database } from "@jarso/db";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Client = SupabaseClient<Database>;

export type CheckinResult = { status: "recorded" | "already"; sparks: number };

const LOAD_FAILED = "We couldn't load your progress.";

/** Sparks, level, streak, badges and look. The child or one of their parents may read it. */
export async function getProgress(db: Client, childId: string): Promise<Progress> {
  const { data, error } = await db.rpc("get_progress", { p_child_id: childId });
  if (error) throw toAppError(error, LOAD_FAILED);
  const parsed = progressSchema.safeParse(data);
  if (!parsed.success) throw new AppError("INTERNAL", LOAD_FAILED, { cause: parsed.error });
  return parsed.data;
}

/** The child's daily "did you spend anything?" check-in. Asking twice in a day is fine. */
export async function dailyCheckin(db: Client, answer: CheckinAnswer): Promise<CheckinResult> {
  const { data, error } = await db.rpc("daily_checkin", { p_answer: answer });
  if (error) throw toAppError(error, "We couldn't save your check-in.");
  // The function returns jsonb, so check the shape instead of trusting it.
  const result = data as Partial<CheckinResult> | null;
  if (
    (result?.status !== "recorded" && result?.status !== "already") ||
    typeof result.sparks !== "number"
  ) {
    throw new AppError("INTERNAL", "We couldn't save your check-in.", { cause: data });
  }
  return { status: result.status, sparks: result.sparks };
}

export async function setJarsoLook(db: Client, look: JarsoLook): Promise<void> {
  const { error } = await db.rpc("set_jarso_look", { p_lid: look.lid, p_wear: look.wear });
  if (error) {
    if (error.code === "JA409") {
      throw new AppError("VALIDATION", "Not unlocked yet", { cause: error });
    }
    throw toAppError(error, "We couldn't change Jarso's look.");
  }
}
