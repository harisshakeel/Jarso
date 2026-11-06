import type { JarsoLook } from "@jarso/core/mascot";
import { type Progress, parentLabel } from "@jarso/core/progress";
import { findParentLabels } from "@jarso/data/family";
import { dailyCheckin, getProgress, setJarsoLook } from "@jarso/data/progress";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The child's sparks, level, streak, badges and Jarso's look. */
export function useProgress() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.progress(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => getProgress(supabase, userId as string),
  });
}

/** Answers today's check-in; the sparks and streak read fresh after. */
export function useDailyCheckin() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answer: "yes" | "nope") => dailyCheckin(supabase, answer),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.progress(userId as string) }),
  });
}

/** Changes Jarso's look at once; puts the old look back if the server says no. */
export function useSetJarsoLook() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const key = keys.progress(userId ?? "");
  return useMutation({
    mutationFn: (look: JarsoLook) => setJarsoLook(supabase, look),
    onMutate: async (look) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Progress>(key);
      if (previous) queryClient.setQueryData<Progress>(key, { ...previous, look });
      return { previous };
    },
    onError: (_error, _look, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** What the child calls their parent: the first label, or "your parent". */
export function useParentLabel(): string {
  const { userId } = useSession();
  const { data } = useQuery({
    queryKey: keys.parentLabel(userId ?? ""),
    enabled: Boolean(userId),
    staleTime: DAY_MS,
    queryFn: () => findParentLabels(supabase, userId as string),
    select: (labels) => parentLabel(labels[0]),
  });
  return data ?? parentLabel(null);
}
