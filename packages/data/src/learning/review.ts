import { reviewPool } from "@jarso/core/learning/content";
import { addDays, familyToday, localDateOf } from "@jarso/core/lib";
import { buildWeeklyReview, type WeeklyReview, weekBounds } from "@jarso/core/review";
import { sumDueOccurrences } from "@jarso/data/allowance";
import { getGoalView } from "@jarso/data/goals";
import { getHistorySince } from "@jarso/data/ledger";
import { getLearningOverview } from "./overview";
import * as repo from "./repository";

/**
 * This week's review (FR11): read what the week's screens already read, then build in code.
 * Callers check who may read it; `timezone` and `currency` are the family's.
 */
export async function getWeeklyReview(
  db: repo.Client,
  childId: string,
  opts: { timezone: string; currency: string; now: Date },
): Promise<WeeklyReview> {
  const { timezone, now } = opts;
  const today = familyToday(timezone, now);
  const { weekStart } = weekBounds(today);
  const [history, due, goal, learning, reviews, recentItemKeys] = await Promise.all([
    getHistorySince(db, childId, weekStart, { timezone, now: now.getTime() }),
    sumDueOccurrences(db, childId),
    getGoalView(db, childId),
    getLearningOverview(db, childId, { timezone, now }),
    repo.listReviewItems(db, childId),
    repo.listRecentPracticeKeys(db, childId, addDays(today, -14)),
  ]);
  // A skill's row changes whenever the child answers on it, so one updated this week (in the
  // family's own days) was worked on this week.
  const workedOnThisWeek = learning.skills
    .filter((skill) => skill.updatedAt && localDateOf(skill.updatedAt, timezone) >= weekStart)
    .map((skill) => skill.skillKey);
  return buildWeeklyReview({
    today,
    currency: opts.currency,
    history,
    stillDueMinor: due.totalMinor,
    goal,
    skills: learning.skills,
    workedOnThisWeek,
    reviews,
    pool: reviewPool,
    recentItemKeys,
  });
}
