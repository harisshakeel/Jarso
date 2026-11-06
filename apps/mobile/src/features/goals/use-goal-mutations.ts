import type { GoalInput } from "@jarso/core/goals";
import { callArchiveGoal, callMarkCelebrated, callSaveGoal } from "@jarso/data/goals";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** After a goal change: the goal, Home (its card and "do this next") and progress read fresh. */
function useRefreshGoal() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return () => {
    const id = userId as string;
    void queryClient.invalidateQueries({ queryKey: keys.goal(id) });
    void queryClient.invalidateQueries({ queryKey: keys.home(id) });
    void queryClient.invalidateQueries({ queryKey: keys.progress(id) });
  };
}

/** Saves the child's goal (`save_goal` checks the plan against the allowance and the price). */
export function useSaveGoal() {
  const refresh = useRefreshGoal();
  return useMutation({
    mutationFn: (input: GoalInput) => callSaveGoal(supabase, input),
    onSuccess: () => {
      refresh();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  });
}

/** Closes the goal so the child can pick something new. The money stays in Save. */
export function useArchiveGoal() {
  const refresh = useRefreshGoal();
  return useMutation({
    mutationFn: (goalId: string) => callArchiveGoal(supabase, goalId),
    onSuccess: refresh,
  });
}

/**
 * Marks the goal-reached moment as seen. No refresh, as on the web: refetching would replace the
 * moment the child is looking at. The next read has `celebrated_at`.
 */
export function useMarkCelebrated() {
  return useMutation({
    mutationFn: (goalId: string) => callMarkCelebrated(supabase, goalId),
  });
}
