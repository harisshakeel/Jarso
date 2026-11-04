import { fetchUnreadCount, listNotices, markRead } from "@jarso/data/notifications";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

const PAGE_SIZE = 20;

/** The child's notices, newest first, 20 a page; the next page starts `before` the last one. */
export function useNotices() {
  const { userId } = useSession();
  return useInfiniteQuery({
    queryKey: keys.notices(userId ?? ""),
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      listNotices(supabase, userId as string, { before: pageParam, limit: PAGE_SIZE }),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
}

/** How many notices the child hasn't opened (the Notifications badge). */
export function useUnreadCount() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.unread(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => fetchUnreadCount(supabase),
  });
}

/** Marks notices read (`null`: all of them), then refreshes the badge and the inbox. */
export function useMarkRead() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | null) => markRead(supabase, ids),
    onSuccess: () => {
      const id = userId ?? "";
      void queryClient.invalidateQueries({ queryKey: keys.unread(id) });
      void queryClient.invalidateQueries({ queryKey: keys.notices(id) });
    },
  });
}
