import { getHistoryPage } from "@jarso/data/ledger";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { useHome } from "@/features/jars";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * The child's history, newest first, a page at a time. Each page says where the next, older
 * one starts (`olderBefore`); null means the end. Days are the family's, so it waits for Home.
 */
export function useHistory() {
  const { userId } = useSession();
  const home = useHome();
  const timezone = home.data?.context.timezone;
  const history = useInfiniteQuery({
    queryKey: keys.history(userId ?? ""),
    enabled: Boolean(userId && timezone),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getHistoryPage(supabase, userId as string, {
        timezone: timezone as string,
        now: Date.now(),
        before: pageParam,
      }),
    getNextPageParam: (last) => last.olderBefore ?? undefined,
  });
  return { history, home };
}

/**
 * A parent's read of one child's history, paged the same way. Days are the family's `timezone`
 * (from the family read), so it waits for it.
 */
export function useChildHistory(childId: string, timezone: string | undefined) {
  return useInfiniteQuery({
    queryKey: keys.childHistory(childId),
    enabled: Boolean(timezone),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getHistoryPage(supabase, childId, {
        timezone: timezone as string,
        now: Date.now(),
        before: pageParam,
      }),
    getNextPageParam: (last) => last.olderBefore ?? undefined,
  });
}
