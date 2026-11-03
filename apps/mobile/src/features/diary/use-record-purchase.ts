import { callRecordPurchase } from "@jarso/data/diary";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSession } from "@/features/auth";
import { dispatchNotices } from "@/lib/notices";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";

export type PurchaseVariables = {
  amountMinor: number;
  category: string;
  label?: string;
  /** One per sheet opening, so a retry after a failed request records once. */
  idempotencyKey: string;
};

/** Records a purchase. On success: refresh Home and History, tell the parent, a light haptic. */
export function useRecordPurchase() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PurchaseVariables) =>
      callRecordPurchase(supabase, {
        childId: userId as string,
        amountMinor: input.amountMinor,
        category: input.category,
        label: input.label ?? "",
        idempotencyKey: input.idempotencyKey,
      }),
    onSuccess: (result) => {
      // not_enough_spend resolves too, but nothing was recorded.
      if (result.status !== "recorded") return;
      const id = userId as string;
      void queryClient.invalidateQueries({ queryKey: keys.home(id) });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
      dispatchNotices();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  });
}
