import "server-only";
// Weekly review (FR11): read what the week's screens already read, then build in code.
import { cache } from "react";
import { listDueForChild } from "@/features/allowance/server";
import { assertSelfOrParentOf, getFamily, getFamilyNow } from "@/features/family/server";
import { getGoalView } from "@/features/goals/server";
import { getLearningOverview, reviewPool } from "@/features/learning/server";
import { getHistorySince } from "@/features/ledger/server";
import { AppError, addDays, familyToday, localDateOf } from "@/lib";
import { createClient } from "@/lib/supabase/server";
import { buildWeeklyReview, weekBounds } from "../build";
import type { WeeklyReview } from "../types";
import { listRecentPracticeKeys, listReviewItems } from "./repository";

/** This week's review for the child, readable by the child and their parents. */
export const getWeeklyReview = cache(async (childId: string): Promise<WeeklyReview> => {
  await assertSelfOrParentOf(childId);
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");
  const today = familyToday(family.timezone, await getFamilyNow(family.id));
  const { weekStart } = weekBounds(today);
  const db = await createClient();
  const [history, due, goal, learning, reviews, recentItemKeys] = await Promise.all([
    getHistorySince(childId, weekStart),
    listDueForChild(childId),
    getGoalView(childId),
    getLearningOverview(childId),
    listReviewItems(db, childId),
    listRecentPracticeKeys(db, childId, addDays(today, -14)),
  ]);
  // A skill's row changes whenever the child answers on it, so one updated this week (in the
  // family's own days) was worked on this week.
  const workedOnThisWeek = learning.skills
    .filter(
      (skill) => skill.updatedAt && localDateOf(skill.updatedAt, family.timezone) >= weekStart,
    )
    .map((skill) => skill.skillKey);
  return buildWeeklyReview({
    today,
    currency: family.currency,
    history,
    stillDueMinor: due.totalMinor,
    goal,
    skills: learning.skills,
    workedOnThisWeek,
    reviews,
    pool: reviewPool,
    recentItemKeys,
  });
});
