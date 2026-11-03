import { undoEntry } from "@jarso/data/diary";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSession } from "@/features/auth";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

/**
 * Takes a purchase or money received back (within a day). When it was undone: refreshes Home and
 * History, tells the parent, a light haptic. A refusal (not enough in a jar) does none of that.
 */
export function useUndo() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => undoEntry(supabase, entryId),
    onSuccess: (result) => {
      if (result === "not_enough_spend" || result === "not_enough_save") return;
      const id = userId as string;
      void queryClient.invalidateQueries({ queryKey: keys.home(id) });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
      dispatchNotices();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  });
}
