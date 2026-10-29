import "server-only";
import { cache } from "react";
import { assertRole, assertSelfOrParentOf, getFamily } from "@/features/family/server";
import { AppError, addDays, familyToday, startOfWeek } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import { checkIn, findMission, findReviewItem, missions, reviewPool } from "../content";
import { gradeStep } from "../grade";
import {
  attemptSummary,
  buildJourney,
  canOpenMission,
  chooseNextStep,
  daysLearnedThisWeek,
  pickPracticeItems,
  resumePosition,
} from "../journey";
import { answerableSteps, bodyFor } from "../steps";
import type { AnswerableStep, LearningOverview, Phase, StepAnswer, StepResult } from "../types";
import * as repo from "./repository";

/**
 * Learning rules on the server. Children write their own progress; a child or their parent
 * reads it. Every answer is graded again here with the same gradeStep the player uses.
 */

type FamilyClock = { timezone: string; today: string };

async function familyClock(): Promise<FamilyClock> {
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");
  return { timezone: family.timezone, today: familyToday(family.timezone) };
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
  const { timezone, today } = await familyClock();
  const weekStart = startOfWeek(today);
  const [attempts, skills, reviews, checkInResult, activity] = await Promise.all([
    repo.listAttempts(db, childId),
    repo.listSkillProgress(db, childId),
    repo.listReviewItems(db, childId),
    repo.findCheckIn(db, childId),
    // A day of slack either side of the week covers every timezone; the count filters by date.
    repo.listActivity(db, childId, `${addDays(weekStart, -1)}T00:00:00Z`),
  ]);
  const completedAttempts = attempts.filter((a) => a.status === "completed");
  const results = await repo.listStepResults(
    db,
    completedAttempts.map((a) => a.id),
  );

  const journey = buildJourney(missions, attempts, timezone);
  const practiceDue = reviews.filter((r) => r.dueOn <= today).length;
  const completed = completedAttempts
    .flatMap((attempt) => {
      const mission = findMission(attempt.missionKey);
      if (!mission || !attempt.completedAt) return [];
      const summary = attemptSummary(results.get(attempt.id) ?? []);
      return [
        {
          missionKey: mission.key,
          title: mission.title,
          completedOn: journey.find((m) => m.key === mission.key)?.completedOn ?? today,
          completedAt: attempt.completedAt,
          ...summary,
        },
      ];
    })
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .map(({ completedAt: _completedAt, ...rest }) => rest);

  return {
    journey,
    skills,
    checkIn: checkInResult,
    practiceDue,
    daysThisWeek: daysLearnedThisWeek(activity, timezone, today),
    nextStep: chooseNextStep(journey, checkInResult !== null, practiceDue),
    completed,
  };
});

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export type MissionSession = {
  attemptId: string | null;
  results: StepResult[];
};

/** For the mission page: the open attempt and its results, or nothing yet. Locked → NOT_FOUND. */
export async function getMissionSession(missionKey: string): Promise<MissionSession> {
  const user = await assertChild();
  const mission = findMission(missionKey);
  if (!mission) throw new AppError("NOT_FOUND", "We couldn't find that mission.");
  const overview = await getLearningOverview(user.id);
  if (!canOpenMission(overview.journey, missionKey))
    throw new AppError("NOT_FOUND", "Finish the mission before this one first.");
  const db = await createClient();
  const open = (await repo.listAttempts(db, user.id)).find(
    (a) =>
      a.missionKey === missionKey && a.status === "started" && a.contentVersion === mission.version,
  );
  if (!open) return { attemptId: null, results: [] };
  const results = await repo.listStepResults(db, [open.id]);
  return { attemptId: open.id, results: results.get(open.id) ?? [] };
}

/** Starts the mission or resumes its open attempt. */
export async function startMission(missionKey: string): Promise<MissionSession> {
  const user = await assertChild();
  const mission = findMission(missionKey);
  if (!mission) throw new AppError("NOT_FOUND", "We couldn't find that mission.");
  const overview = await getLearningOverview(user.id);
  if (!canOpenMission(overview.journey, missionKey))
    throw new AppError("FORBIDDEN", "Finish the mission before this one first.");
  const db = await createClient();
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
    answer: input.answer,
    correct,
    hintsUsed: input.hintsUsed,
    tries: input.tries,
  });
  return { correct };
}

/** Finishes the mission once every step (and every replay) is answered. */
export async function completeMission(attemptId: string) {
  const user = await assertChild();
  const { db, attempt, mission } = await ownAttempt(attemptId, user.id);
  const results = (await repo.listStepResults(db, [attemptId])).get(attemptId) ?? [];
  if (attempt.status === "started" && resumePosition(mission, results).phase !== "finished") {
    throw new AppError("VALIDATION", "Finish every step first.");
  }
  await repo.completeMission(db, attemptId);
  return attemptSummary(results);
}

// ---------------------------------------------------------------------------
// Practice (spaced review)
// ---------------------------------------------------------------------------

/** A short set of due review items in new situations. Empty when nothing is due. */
export async function getPracticeSet(): Promise<AnswerableStep[]> {
  const user = await assertChild();
  const db = await createClient();
  const { today } = await familyClock();
  const [reviews, history] = await Promise.all([
    repo.listReviewItems(db, user.id),
    repo.listPracticeHistory(db, user.id, addDays(today, -60)),
  ]);
  const due = reviews.filter((r) => r.dueOn <= today).map((r) => r.skillKey);
  return pickPracticeItems(due, reviewPool, history, today);
}

export async function recordPractice(input: {
  itemKey: string;
  answer: StepAnswer;
  hintsUsed: number;
  tries: number;
}): Promise<{ correct: boolean }> {
  await assertChild();
  const item = findReviewItem(input.itemKey);
  if (!item) throw new AppError("NOT_FOUND", "We couldn't find that question.");
  const { correct } = gradeStep(bodyFor(item, "main"), input.answer);
  await repo.recordPracticeResult(await createClient(), {
    itemKey: item.key,
    skillKey: item.skill,
    answer: input.answer,
    correct,
    hintsUsed: input.hintsUsed,
    tries: input.tries,
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
  const graded = checkIn.questions.map((question) => {
    const answer = given.get(question.key) as StepAnswer;
    return {
      stepKey: question.key,
      skill: question.skill,
      answer,
      correct: gradeStep(bodyFor(question, "main"), answer).correct,
    };
  });
  const correctCount = graded.filter((g) => g.correct).length;
  await repo.completeCheckIn(await createClient(), {
    version: checkIn.version,
    answers: graded,
    correctCount,
  });
  return { correctCount };
}
