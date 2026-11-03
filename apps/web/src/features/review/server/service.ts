import "server-only";
import type { WeeklyReview } from "@jarso/core/review";
import { getWeeklyReview as loadWeeklyReview } from "@jarso/data/learning";
// Weekly review (FR11): the shared read builds it from what the week's screens already read.
import { cache } from "react";
import { assertSelfOrParentOf, getFamily } from "@/features/family/server";
import { AppError } from "@/lib";
import { createClient } from "@/lib/supabase/server";

/** This week's review for the child, readable by the child and their parents. */
export const getWeeklyReview = cache(async (childId: string): Promise<WeeklyReview> => {
  await assertSelfOrParentOf(childId);
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");
  return loadWeeklyReview(await createClient(), childId, {
    timezone: family.timezone,
    currency: family.currency,
    now: new Date(),
  });
});
