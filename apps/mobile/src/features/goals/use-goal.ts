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

/**
 * The child's allowance for the goal sheet's plan hint: the latest schedule's amount unless it was
 * stopped (the web's `runningSchedule`), otherwise null.
 */
export function useAllowance() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.schedule(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => findLatestSchedule(supabase, userId as string),
    select: (schedule) => (schedule && schedule.status !== "stopped" ? schedule.amountMinor : null),
  });
}
