import "server-only";
import type { Phase, SkillKey } from "@jarso/core/learning";
import type { Client } from "@jarso/data/learning";
import { AppError, toAppError } from "@/lib";

/**
 * The learning reads are shared with the phone (`@jarso/data/learning`); the writes below stay
 * on the server. `db` is the caller's server client, so RLS and the functions' own checks apply.
 */
export * from "@jarso/data/learning";

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
