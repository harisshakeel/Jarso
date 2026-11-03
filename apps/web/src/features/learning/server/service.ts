import "server-only";
import type { AnswerableStep, LearningOverview, Phase, StepAnswer } from "@jarso/core/learning";
import {
  answerableSteps,
  attemptSummary,
  bodyFor,
  buildJourney,
  canOpenMission,
  gradeStep,
  resumePosition,
} from "@jarso/core/learning";
import {
  getLearningOverview as loadLearningOverview,
  getMissionSession as loadMissionSession,
  getPracticeSet as loadPracticeSet,
  type MissionSession,
} from "@jarso/data/learning";
import { cache } from "react";
import { assertRole, assertSelfOrParentOf, getFamily } from "@/features/family/server";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import { checkIn, findMission, findReviewItem, missions } from "./content";
import * as repo from "./repository";

export type { MissionSession };

/**
 * Learning rules on the server. Children write their own progress; a child or their parent
 * reads it. Every answer is graded again here with the same gradeStep the player uses.
 */

/** The family's timezone; the shared reads take it with the server's clock. */
async function familyClock(): Promise<{ timezone: string }> {
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");
  return { timezone: family.timezone };
}

/** The signed-in child. Learning writes are the child's own. */
async function assertChild() {
  const { user } = await assertRole("child");
  return user;
}

/** Overview of a child's learning, for the child's Learn page, Home card and the parent's page. */
export const getLearningOverview = cache(async (childId: string): Promise<LearningOverview> => {
  await assertSelfOrParentOf(childId);
  const db = await createClient();
  const { timezone } = await familyClock();
  return loadLearningOverview(db, childId, { timezone, now: new Date() });
});

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

/** The child's attempts, and whether a mission is open to them (done, or the current one). */
async function missionAccess(childId: string, missionKey: string) {
  const db = await createClient();
  const [{ timezone }, attempts] = await Promise.all([
    familyClock(),
    repo.listAttempts(db, childId),
  ]);
  const canOpen = canOpenMission(buildJourney(missions, attempts, timezone), missionKey);
  return { db, attempts, canOpen };
}

/** For the mission page: the open attempt and its results, or nothing yet. Locked → NOT_FOUND. */
export async function getMissionSession(missionKey: string): Promise<MissionSession> {
  const user = await assertChild();
  const mission = findMission(missionKey);
  if (!mission) throw new AppError("NOT_FOUND", "We couldn't find that mission.");
  const db = await createClient();
  const { timezone } = await familyClock();
  const session = await loadMissionSession(db, user.id, mission.key, { now: new Date(), timezone });
  if (!session) throw new AppError("NOT_FOUND", "Finish the mission before this one first.");
  return session;
}

/** Starts the mission or resumes its open attempt. */
export async function startMission(missionKey: string): Promise<MissionSession> {
  const user = await assertChild();
  const mission = findMission(missionKey);
  if (!mission) throw new AppError("NOT_FOUND", "We couldn't find that mission.");
  const { db, canOpen } = await missionAccess(user.id, missionKey);
  if (!canOpen) throw new AppError("FORBIDDEN", "Finish the mission before this one first.");
  const attemptId = await repo.startMission(db, mission.key, mission.version);
  const results = await repo.listStepResults(db, [attemptId]);
  return { attemptId, results: results.get(attemptId) ?? [] };
}

async function ownAttempt(attemptId: string, childId: string) {
  const db = await createClient();
  const attempt = await repo.findAttempt(db, attemptId);
  if (!attempt || attempt.childId !== childId)
    throw new AppError("FORBIDDEN", "You can't do that.");
  const mission = findMission(attempt.missionKey);
  if (!mission) throw new AppError("NOT_FOUND", "We couldn't find that mission.");
  return { db, attempt, mission };
}

export async function recordStep(input: {
  attemptId: string;
  stepKey: string;
  phase: Phase;
  answer: StepAnswer;
  hintsUsed: number;
  tries: number;
}): Promise<{ correct: boolean }> {
  const user = await assertChild();
  const { db, mission } = await ownAttempt(input.attemptId, user.id);
  const step = answerableSteps(mission.steps).find((s) => s.key === input.stepKey);
  if (!step) throw new AppError("NOT_FOUND", "We couldn't find that step.");
  const body = bodyFor(step, input.phase);
  const { correct } = gradeStep(body, input.answer);
  await repo.recordStepResult(db, {
    attemptId: input.attemptId,
    stepKey: step.key,
    phase: input.phase,
    stepType: body.type,
    skillKey: body.skill,
    correct,
    hintsUsed: input.hintsUsed,
    tries: input.tries,
  });
  return { correct };
}

/** Finishes the mission once every step (and every replay) is answered. */
export async function completeMission(attemptId: string, occurredAt?: string) {
  const user = await assertChild();
  const { db, attempt, mission } = await ownAttempt(attemptId, user.id);
  const results = (await repo.listStepResults(db, [attemptId])).get(attemptId) ?? [];
  if (attempt.status === "started" && resumePosition(mission, results).phase !== "finished") {
    throw new AppError("VALIDATION", "Finish every step first.");
  }
  await repo.completeMission(db, attemptId, occurredAt);
  return attemptSummary(results);
}

// ---------------------------------------------------------------------------
// Practice (spaced review)
// ---------------------------------------------------------------------------

/** A short set of due review items in new situations. Empty when nothing is due. */
export async function getPracticeSet(): Promise<AnswerableStep[]> {
  const user = await assertChild();
  const db = await createClient();
  const { timezone } = await familyClock();
  return loadPracticeSet(db, user.id, { timezone, now: new Date() });
}

export async function recordPractice(input: {
  itemKey: string;
  answer: StepAnswer;
  hintsUsed: number;
  tries: number;
  occurredAt?: string;
}): Promise<{ correct: boolean }> {
  await assertChild();
  const item = findReviewItem(input.itemKey);
  if (!item) throw new AppError("NOT_FOUND", "We couldn't find that question.");
  const { correct } = gradeStep(bodyFor(item, "main"), input.answer);
  await repo.recordPracticeResult(await createClient(), {
    itemKey: item.key,
    skillKey: item.skill,
    correct,
    hintsUsed: input.hintsUsed,
    tries: input.tries,
    occurredAt: input.occurredAt,
  });
  return { correct };
}

// ---------------------------------------------------------------------------
// Check-in (FR10)
// ---------------------------------------------------------------------------

export async function completeCheckIn(
  answers: { stepKey: string; answer: StepAnswer }[],
): Promise<{ correctCount: number }> {
  await assertChild();
  const keys = checkIn.questions.map((q) => q.key);
  const given = new Map(answers.map((a) => [a.stepKey, a.answer]));
  if (given.size !== keys.length || keys.some((key) => !given.has(key))) {
    throw new AppError("VALIDATION", "Answer all five questions first.");
  }
  // Graded here; only the count is kept, never the answers themselves.
  const correctCount = checkIn.questions.filter(
    (question) =>
      gradeStep(bodyFor(question, "main"), given.get(question.key) as StepAnswer).correct,
  ).length;
  await repo.completeCheckIn(await createClient(), {
    version: checkIn.version,
    questionCount: checkIn.questions.length,
    correctCount,
  });
  return { correctCount };
}
