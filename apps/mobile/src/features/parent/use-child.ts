import type { ChildSummary } from "@jarso/core/family";
import { countFlaggedSince } from "@jarso/data/guide";
import { getHistoryPage, getJars } from "@jarso/data/ledger";
import { useQuery } from "@tanstack/react-query";
import { useFamily } from "@/features/family";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** Flagged chats are counted over the days Jarso keeps chats. */
const FLAGGED_DAYS = 30;

/**
 * One of the parent's children, from the family read. Undefined while it loads and for an id
 * that is not in the family: callers check the family has loaded before treating it as unknown.
 */
export function useChild(childId: string): ChildSummary | undefined {
  return useFamily().data?.children.find((child) => child.id === childId);
}

/** The child's Spend and Save. */
export function useChildJars(childId: string) {
  return useQuery({
    queryKey: keys.childJars(childId),
    queryFn: () => getJars(supabase, childId),
  });
}

/** The child's newest history lines (the first page), with the family's days. */
export function useRecentHistory(childId: string, timezone: string) {
  return useQuery({
    queryKey: keys.childRecent(childId),
    queryFn: () => getHistoryPage(supabase, childId, { timezone, now: Date.now() }),
  });
}

// The child's learning overview lives with learning (the summary page reads it too).
export { useChildLearning } from "@/features/learning";

/** How many of the child's chats in the last 30 days are worth a look. Only while Jarso is set up. */
export function useFlaggedChats(childId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.childFlagged(childId),
    enabled,
    queryFn: () =>
      countFlaggedSince(
        supabase,
        childId,
        new Date(Date.now() - FLAGGED_DAYS * 24 * 60 * 60_000).toISOString(),
      ),
  });
}
