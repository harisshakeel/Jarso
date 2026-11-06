import { sparkChips } from "@jarso/core/home";
import type { Progress } from "@jarso/core/progress";
import { getProgress } from "@jarso/data/progress";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { CelebrationChip } from "@/components/celebrate";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

const REFETCH_MS = 1500;

/**
 * The chips for a celebration after a logged action: `snapshot()` before the action keeps the
 * cached progress, `chips()` after it refetches (at most 1.5 s) and reports Sparks gained and
 * the streak. Never throws; no chips on any failure.
 */
export function useSparkChips(): {
  snapshot: () => void;
  chips: () => Promise<CelebrationChip[]>;
} {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const before = useRef<Progress | undefined>(undefined);

  const snapshot = useCallback(() => {
    before.current = queryClient.getQueryData<Progress>(keys.progress(userId ?? ""));
  }, [queryClient, userId]);

  const chips = useCallback(async () => {
    if (!userId) return [];
    const key = keys.progress(userId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const fresh = queryClient.fetchQuery({
        queryKey: key,
        queryFn: () => getProgress(supabase, userId),
        staleTime: 0,
      });
      const late = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), REFETCH_MS);
      });
      // A refetch that is too slow still lets the celebration go with what the cache has.
      const after = (await Promise.race([fresh, late])) ?? queryClient.getQueryData<Progress>(key);
      return sparkChips(before.current, after);
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }, [queryClient, userId]);

  return { snapshot, chips };
}
