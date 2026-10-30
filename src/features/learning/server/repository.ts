import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import { type SkillKey, type SkillLevel, skillKeys } from "../skills";
import type { CheckInResult, Phase, ReviewItem, SkillProgress, StepResult } from "../types";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows the learning tables and functions. `db` is the caller's server client,
 * so RLS (child or their parents) and the functions' own checks apply.
 */

export type AttemptRow = {
  id: string;
  childId: string;
  missionKey: string;
  contentVersion: number;
  status: "started" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
};

function asStatus(value: string): AttemptRow["status"] {
  return value === "completed" || value === "abandoned" ? value : "started";
}

function asSkill(value: string): SkillKey | null {
  return (skillKeys as readonly string[]).includes(value) ? (value as SkillKey) : null;
}

function asLevel(value: number): SkillLevel {
  return (value >= 0 && value <= 3 ? value : 0) as SkillLevel;
}

function toAttempt(row: {
  id: string;
  child_id: string;
  mission_key: string;
  content_version: number;
  status: string;
  started_at: string;
  completed_at: string | null;
}): AttemptRow {
  return {
    id: row.id,
    childId: row.child_id,
    missionKey: row.mission_key,
    contentVersion: row.content_version,
    status: asStatus(row.status),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

const ATTEMPT_COLUMNS =
  "id, child_id, mission_key, content_version, status, started_at, completed_at";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A child's started and completed attempts (the latest 200), oldest first. */
export async function listAttempts(db: Client, childId: string): Promise<AttemptRow[]> {
  const { data, error } = await db
    .from("mission_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("child_id", childId)
    .neq("status", "abandoned")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw toAppError(error, "Failed to load missions");
  return data.map(toAttempt).reverse();
}

export async function findAttempt(db: Client, attemptId: string): Promise<AttemptRow | null> {
  const { data, error } = await db
    .from("mission_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the mission");
  return data ? toAttempt(data) : null;
}

/** Results of the given attempts, grouped by attempt id. */
export async function listStepResults(
  db: Client,
  attemptIds: readonly string[],
): Promise<Map<string, StepResult[]>> {
  const grouped = new Map<string, StepResult[]>();
  if (attemptIds.length === 0) return grouped;
  const { data, error } = await db
    .from("step_results")
    .select("attempt_id, step_key, phase, correct, hints_used, tries")
    .in("attempt_id", [...attemptIds])
    .order("answered_at", { ascending: true });
  if (error) throw toAppError(error, "Failed to load mission progress");
  for (const row of data) {
    const list = grouped.get(row.attempt_id) ?? [];
    list.push({
      stepKey: row.step_key,
      phase: (row.phase === "replay" ? "replay" : "main") as Phase,
      correct: row.correct,
      hintsUsed: row.hints_used,
      tries: row.tries,
    });
    grouped.set(row.attempt_id, list);
  }
  return grouped;
}

export async function listSkillProgress(db: Client, childId: string): Promise<SkillProgress[]> {
  const { data, error } = await db
    .from("skill_progress")
    .select(
      "skill_key, level, first_try_correct, correct_with_hints, reasons_correct, reviews_passed",
    )
    .eq("child_id", childId);
  if (error) throw toAppError(error, "Failed to load skills");
  return data.flatMap((row) => {
    const skillKey = asSkill(row.skill_key);
    if (!skillKey) return [];
    return [
      {
        skillKey,
        level: asLevel(row.level),
        firstTryCorrect: row.first_try_correct,
        correctWithHints: row.correct_with_hints,
        reasonsCorrect: row.reasons_correct,
        reviewsPassed: row.reviews_passed,
      },
    ];
  });
}

export async function listReviewItems(db: Client, childId: string): Promise<ReviewItem[]> {
  const { data, error } = await db
    .from("review_items")
    .select("skill_key, box, due_on")
    .eq("child_id", childId)
    .order("due_on", { ascending: true });
  if (error) throw toAppError(error, "Failed to load practice");
  return data.flatMap((row) => {
    const skillKey = asSkill(row.skill_key);
    return skillKey ? [{ skillKey, box: row.box, dueOn: row.due_on }] : [];
  });
}

/** Practice answers since a family date, for picking unseen items. */
export async function listPracticeHistory(
  db: Client,
  childId: string,
  sinceDate: string,
): Promise<{ itemKey: string; answeredOn: string; answeredAt: string }[]> {
  const { data, error } = await db
    .from("practice_results")
    .select("item_key, answered_on, answered_at")
    .eq("child_id", childId)
    .gte("answered_on", sinceDate)
    .order("answered_at", { ascending: true });
  if (error) throw toAppError(error, "Failed to load practice");
  return data.map((row) => ({
    itemKey: row.item_key,
    answeredOn: row.answered_on,
    answeredAt: row.answered_at,
  }));
}

/** When the child answered anything (missions and practice) since an instant. */
export async function listActivity(
  db: Client,
  childId: string,
  sinceIso: string,
): Promise<string[]> {
  const [steps, practice] = await Promise.all([
    db
      .from("step_results")
      .select("answered_at")
      .eq("child_id", childId)
      .gte("answered_at", sinceIso),
    db
      .from("practice_results")
      .select("answered_at")
      .eq("child_id", childId)
      .gte("answered_at", sinceIso),
  ]);
  if (steps.error) throw toAppError(steps.error, "Failed to load learning days");
  if (practice.error) throw toAppError(practice.error, "Failed to load learning days");
  return [...steps.data, ...practice.data].map((row) => row.answered_at);
}

export async function findCheckIn(db: Client, childId: string): Promise<CheckInResult | null> {
  const { data, error } = await db
    .from("learning_checkins")
    .select("completed_at, correct_count")
    .eq("child_id", childId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the check-in");
  return data ? { completedAt: data.completed_at, correctCount: data.correct_count } : null;
}

// ---------------------------------------------------------------------------
// Writes (Postgres functions; the caller must be the approved child)
// ---------------------------------------------------------------------------

export async function startMission(
  db: Client,
  missionKey: string,
  version: number,
): Promise<string> {
  const { data, error } = await db.rpc("start_mission", {
    p_mission_key: missionKey,
    p_content_version: version,
  });
  if (error) throw toAppError(error, "Failed to start the mission");
  if (!data) throw new AppError("INTERNAL", "Failed to start the mission");
  return data;
}

export async function recordStepResult(
  db: Client,
  input: {
    attemptId: string;
    stepKey: string;
    phase: Phase;
    stepType: string;
    skillKey: SkillKey;
    correct: boolean;
    hintsUsed: number;
    tries: number;
  },
): Promise<boolean> {
  const { data, error } = await db.rpc("record_step_result", {
    p_attempt_id: input.attemptId,
    p_step_key: input.stepKey,
    p_phase: input.phase,
    p_step_type: input.stepType,
    p_skill_key: input.skillKey,
    p_correct: input.correct,
    p_hints_used: input.hintsUsed,
    p_tries: input.tries,
  });
  if (error) throw toAppError(error, "Failed to save your answer");
  return data === true;
}

export async function completeMission(
  db: Client,
  attemptId: string,
  occurredAt?: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("complete_mission", {
    p_attempt_id: attemptId,
    p_occurred_at: occurredAt,
  });
  if (error) throw toAppError(error, "Failed to finish the mission");
  return data === true;
}

export async function recordPracticeResult(
  db: Client,
  input: {
    itemKey: string;
    skillKey: SkillKey;
    correct: boolean;
    hintsUsed: number;
    tries: number;
    occurredAt?: string;
  },
): Promise<boolean> {
  const { data, error } = await db.rpc("record_practice_result", {
    p_item_key: input.itemKey,
    p_skill_key: input.skillKey,
    p_correct: input.correct,
    p_hints_used: input.hintsUsed,
    p_tries: input.tries,
    p_occurred_at: input.occurredAt,
  });
  if (error) throw toAppError(error, "Failed to save your answer");
  return data === true;
}

export async function completeCheckIn(
  db: Client,
  input: { version: number; questionCount: number; correctCount: number },
): Promise<boolean> {
  const { data, error } = await db.rpc("complete_checkin", {
    p_content_version: input.version,
    p_question_count: input.questionCount,
    p_correct_count: input.correctCount,
  });
  if (error) throw toAppError(error, "Failed to save the check-in");
  return data === true;
}
