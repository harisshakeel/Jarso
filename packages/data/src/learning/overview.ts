import type { LearningOverview } from "@jarso/core/learning";
import {
  attemptSummary,
  buildJourney,
  chooseNextStep,
  daysLearnedThisWeek,
  isComeback,
  learningStreak,
  longestStreak,
  totalPoints,
} from "@jarso/core/learning";
import { findMission, missions } from "@jarso/core/learning/content";
import { addDays, familyToday, localDateOf, startOfWeek } from "@jarso/core/lib";
import * as repo from "./repository";

/** How far back the streak can reach, in days; the activity read goes this far. */
const STREAK_DAYS = 60;

/**
 * Overview of a child's learning, for the child's Learn page, Home card and the parent's page.
 * Callers check who may read it; `timezone` is the family's, `now` the caller's clock.
 */
export async function getLearningOverview(
  db: repo.Client,
  childId: string,
  opts: { timezone: string; now: Date },
): Promise<LearningOverview> {
  const { timezone } = opts;
  const today = familyToday(timezone, opts.now);
  const weekStart = startOfWeek(today);
  const [attempts, skills, reviews, checkInResult, activity, lastActivity, practice] =
    await Promise.all([
      repo.listAttempts(db, childId),
      repo.listSkillProgress(db, childId),
      repo.listReviewItems(db, childId),
      repo.findCheckIn(db, childId),
      // Back far enough for a long streak; a day of slack covers every timezone. The week
      // count and the streak both filter by family-local date.
      repo.listActivity(db, childId, `${addDays(weekStart, -STREAK_DAYS)}T00:00:00Z`),
      repo.findLastActivity(db, childId),
      repo.listPracticeResults(db, childId),
    ]);
  const completedAttempts = attempts.filter((a) => a.status === "completed");
  // Every attempt's steps count for points, a mission still in progress included.
  const allResults = await repo.listStepResults(
    db,
    attempts.map((a) => a.id),
  );
  const results = new Map(completedAttempts.map((a) => [a.id, allResults.get(a.id) ?? []]));

  const journey = buildJourney(missions, attempts, timezone);
  const practiceDue = reviews.filter((r) => r.dueOn <= today).length;
  const completed = completedAttempts
    .flatMap((attempt) => {
      const mission = findMission(attempt.missionKey);
      if (!mission || !attempt.completedAt) return [];
      const summary = attemptSummary(results.get(attempt.id) ?? []);
      return [
        {
          attemptId: attempt.id,
          missionKey: mission.key,
          title: mission.title,
          // Each attempt's own day: a replayed mission has a row per finish.
          completedOn: localDateOf(attempt.completedAt, timezone),
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
    streak: learningStreak(activity, timezone, today),
    longestStreak: longestStreak(activity, timezone),
    points: totalPoints([...[...allResults.values()].flat(), ...practice]),
    lastLearnedOn: lastActivity ? localDateOf(lastActivity, timezone) : null,
    nextStep: chooseNextStep(
      journey,
      checkInResult !== null,
      practiceDue,
      isComeback(lastActivity ? localDateOf(lastActivity, timezone) : null, today),
    ),
    completed,
  };
}
