import type { Split } from "@jarso/core/allowance";
import { confirmHandover, getLastSplitWith, markNotGiven } from "@jarso/data/allowance";
import { getGoalView } from "@jarso/data/goals";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { isAppError, logger } from "@/lib";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * The child's last handover split, for the prefill. A failed read is the first-handover prefill
 * (all Spend), never a blocked handover.
 */
export function useLastSplit(childId: string) {
  return useQuery({
    queryKey: keys.childSplit(childId),
    queryFn: async (): Promise<Split | null> => {
      try {
        return await getLastSplitWith(supabase, childId);
      } catch (error) {
        logger.warn("Last split unavailable", { error });
        return null;
      }
    },
  });
}

/** The child's goal, for the handover's plan note. A nice-to-have: a failed read is no goal. */
export function useChildGoal(childId: string) {
  return useQuery({
    queryKey: keys.childGoal(childId),
    queryFn: async () => {
      try {
        return await getGoalView(supabase, childId);
      } catch (error) {
        logger.warn("Goal note unavailable", { error });
        return null;
      }
    },
  });
}

/**
 * A handover write. Whatever the answer the child's pages and the family's reads refresh (a
 * CONFLICT too: the item changed under the parent, so show it as it is now); a write that went
 * through tells the child.
 */
function useHandoverWrite<V extends { childId: string }, R>(call: (input: V) => Promise<R>) {
  const { userId } = useSession();
  const client = useQueryClient();
  const refresh = (childId: string) => {
    void client.invalidateQueries({ queryKey: keys.child(childId) });
    void client.invalidateQueries({ queryKey: keys.family(userId ?? "") });
  };
  return useMutation({
    mutationFn: call,
    onSuccess: (_result, input) => {
      refresh(input.childId);
      dispatchNotices();
    },
    onError: (error, input) => {
      if (isAppError(error) && error.code === "CONFLICT") refresh(input.childId);
    },
  });
}

/** Records the cash and saved split handed over (`already_confirmed` is success). */
export function useConfirmHandover() {
  return useHandoverWrite(
    ({
      childId: _childId,
      ...input
    }: {
      childId: string;
      kind: "allowance" | "gift";
      id: string;
      cashMinor: number;
      savedMinor: number;
      idempotencyKey: string;
    }) => confirmHandover(supabase, input),
  );
}

/** Closes a due allowance without paying it. */
export function useMarkNotGiven() {
  return useHandoverWrite(({ id }: { childId: string; id: string }) => markNotGiven(supabase, id));
}
