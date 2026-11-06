import type { Frequency } from "@jarso/core/allowance";
import { findLatestSchedule } from "@jarso/data/allowance";
import { getGoalView } from "@jarso/data/goals";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** The child's active goal with progress, or null (`goal_progress` also records reaching it). */
export function useGoal() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.goal(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => getGoalView(supabase, userId as string),
  });
}

const scheduleQuery = (userId: string | undefined) => ({
  queryKey: keys.schedule(userId ?? ""),
  enabled: Boolean(userId),
  queryFn: () => findLatestSchedule(supabase, userId as string),
});

/**
 * The child's allowance for the goal sheet's plan hint: the latest schedule's amount unless it was
 * stopped (the web's `runningSchedule`), otherwise null.
 */
export function useAllowance() {
  const { userId } = useSession();
  return useQuery({
    ...scheduleQuery(userId),
    select: (schedule) => (schedule && schedule.status !== "stopped" ? schedule.amountMinor : null),
  });
}

/**
 * The goal's allowance pace for "about N weeks": the frequency of an active schedule, or null (no
 * schedule, or one that is paused or stopped, which adds nothing). Shares `useAllowance`'s cache.
 */
export function useSavingPace(): { frequency: Frequency | null } {
  const { userId } = useSession();
  const { data } = useQuery({
    ...scheduleQuery(userId),
    select: (schedule) => (schedule?.status === "active" ? schedule.frequency : null),
  });
  return { frequency: data ?? null };
}
