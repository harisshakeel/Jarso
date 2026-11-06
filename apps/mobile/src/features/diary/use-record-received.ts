import { callRecordMoneyReceived } from "@jarso/data/diary";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSession } from "@/features/auth";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

export type ReceivedVariables = {
  amountMinor: number;
  jar: "spend" | "save";
  category: string;
  label: string;
  /** One per sheet opening, so a retry records once. */
  idempotencyKey: string;
};

/**
 * Records money from another source (a gift, a job, a find). Counts at once, no approval;
 * online only, as on the web. Then: refresh Home, History and the goal, tell the parent, a haptic.
 */
export function useRecordReceived() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceivedVariables) =>
      callRecordMoneyReceived(supabase, { ...input, childId: userId as string }),
    onSuccess: () => {
      const id = userId as string;
      void queryClient.invalidateQueries({ queryKey: keys.home(id) });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
      void queryClient.invalidateQueries({ queryKey: keys.progress(id) });
      void queryClient.invalidateQueries({ queryKey: keys.goal(id) });
      dispatchNotices();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  });
}
