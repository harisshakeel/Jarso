import { type CoachId, coachIds } from "@jarso/core/learning";
import { AppError, toAppError } from "@jarso/core/lib";
import { type OnboardingReward, onboardingRewardSchema } from "@jarso/core/onboarding";
import type { SaveTourInput, TourState } from "@jarso/core/tour";
import type { Database } from "@jarso/db";
// The child's welcome tour (2026-11-06): reads the child_tours row; writes go through
// save_welcome_tour, which only ever touches the signed-in child's own row.
import type { SupabaseClient } from "@supabase/supabase-js";

type Client = SupabaseClient<Database>;

const isCoach = (value: string | null): value is CoachId =>
  value !== null && (coachIds as readonly string[]).includes(value);

/** The child's tour: a missing row means they haven't picked a buddy or finished it yet. */
export async function findTour(db: Client, childId: string): Promise<TourState> {
  const { data, error } = await db
    .from("child_tours")
    .select("buddy, finished_at")
    .eq("child_id", childId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the tour");
  return {
    buddy: data && isCoach(data.buddy) ? data.buddy : null,
    finishedAt: data?.finished_at ?? null,
  };
}

/** Saves the signed-in child's buddy and/or that they finished (or skipped) the tour. */
export async function saveTour(db: Client, input: SaveTourInput): Promise<void> {
  const { error } = await db.rpc("save_welcome_tour", {
    // The function takes null for "leave as it is"; the generated type omits nullability.
    p_buddy: (input.buddy ?? null) as string,
    p_finished: input.finished ?? false,
  });
  if (error) throw toAppError(error, "Failed to save the tour");
}

/**
 * Finishes the child's intro on the phone: the tour is marked done and the welcome reward (50
 * Sparks and the Jar Starter badge) is paid once for life. A replay returns 0 and null.
 */
export async function completeOnboarding(db: Client): Promise<OnboardingReward> {
  const { data, error } = await db.rpc("complete_child_onboarding");
  if (error) throw toAppError(error, "Failed to finish the intro");
  const parsed = onboardingRewardSchema.safeParse(data);
  if (!parsed.success) {
    throw new AppError("INTERNAL", "Failed to finish the intro", { cause: parsed.error });
  }
  return parsed.data;
}
