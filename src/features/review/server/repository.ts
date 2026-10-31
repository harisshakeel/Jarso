import "server-only";
// The two reads the review needs beyond other features' services: review items and recent practice.
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ReviewItem, type SkillKey, skillKeys } from "@/features/learning";
import { toAppError } from "@/lib";
import type { Database } from "@/types";

type Client = SupabaseClient<Database>;

export async function listReviewItems(db: Client, childId: string): Promise<ReviewItem[]> {
  const { data, error } = await db
    .from("review_items")
    .select("skill_key, box, due_on")
    .eq("child_id", childId);
  if (error) throw toAppError(error, "Failed to load your review");
  return data.flatMap((row) =>
    (skillKeys as readonly string[]).includes(row.skill_key)
      ? [{ skillKey: row.skill_key as SkillKey, box: row.box, dueOn: row.due_on }]
      : [],
  );
}

/** Keys of practice items answered since a date, so the fresh question is one not just seen. */
export async function listRecentPracticeKeys(
  db: Client,
  childId: string,
  sinceDate: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("practice_results")
    .select("item_key")
    .eq("child_id", childId)
    .gte("answered_on", sinceDate);
  if (error) throw toAppError(error, "Failed to load your review");
  return data.map((row) => row.item_key);
}
