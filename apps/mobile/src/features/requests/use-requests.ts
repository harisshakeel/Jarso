import { callCancel, listRequestsFor } from "@jarso/data/requests";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSession } from "@/features/auth";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/** The child's take-outs, put-ins and extras, newest first (open ones, then recent closed). */
export function useRequests() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.requests(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => listRequestsFor(supabase, userId as string),
  });
}

/**
 * Cancels a Waiting request. Either answer means it is no longer open, so Requests, Home and
 * History refresh; only a real cancel tells the parent and gives a haptic.
 */
export function useCancelRequest() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => callCancel(supabase, requestId),
    onSuccess: (result) => {
      const id = userId as string;
      void queryClient.invalidateQueries({ queryKey: keys.requests(id) });
      void queryClient.invalidateQueries({ queryKey: keys.home(id) });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
      if (result !== "cancelled") return;
      dispatchNotices();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  });
}
