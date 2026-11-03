import type { AnswerableStep } from "@jarso/core/learning";
import { pickPracticeItems } from "@jarso/core/learning";
import { reviewPool } from "@jarso/core/learning/content";
import { addDays, familyToday } from "@jarso/core/lib";
import * as repo from "./repository";

/** A short set of due review items in new situations. Empty when nothing is due. */
export async function getPracticeSet(
  db: repo.Client,
  childId: string,
  opts: { timezone: string; now: Date },
): Promise<AnswerableStep[]> {
  const today = familyToday(opts.timezone, opts.now);
  const [reviews, history] = await Promise.all([
    repo.listReviewItems(db, childId),
    repo.listPracticeHistory(db, childId, addDays(today, -60)),
  ]);
  const due = reviews.filter((r) => r.dueOn <= today).map((r) => r.skillKey);
  return pickPracticeItems(due, reviewPool, history, today);
}
