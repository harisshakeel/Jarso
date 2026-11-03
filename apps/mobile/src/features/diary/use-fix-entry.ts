import { callCorrectDiaryEntry } from "@jarso/data/diary";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSession } from "@/features/auth";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

export type FixVariables = {
  entryId: string;
  amountMinor: number;
  category: string;
  label: string;
  idempotencyKey: string;
};

/**
 * Fixes the amount, category or name of one of the child's lines (`correct_diary_entry` checks
 * it is theirs and the jars can take it). A refusal or "nothing changed" resolves too; only a
 * real fix refreshes, tells the parent and gives a haptic.
 */
export function useFixEntry() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FixVariables) => callCorrectDiaryEntry(supabase, input),
    onSuccess: (result, input) => {
      if (result.status !== "fixed") return;
      const id = userId as string;
      void queryClient.invalidateQueries({ queryKey: keys.home(id) });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
      void queryClient.invalidateQueries({ queryKey: keys.goal(id) });
      void queryClient.invalidateQueries({ queryKey: keys.versions(input.entryId) });
      dispatchNotices();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  });
}
