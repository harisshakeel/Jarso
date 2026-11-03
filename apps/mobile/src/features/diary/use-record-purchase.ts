import type { SubmitResult } from "@jarso/core/offline";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useSession } from "@/features/auth";
import { dispatchNotices } from "@/lib/notices";
import { removeItem, submit } from "@/lib/outbox";
import { keys } from "@/lib/query";

/** Exactly what the web's purchase form posts: the outbox route parses it with the same schema. */
export type PurchasePayload = {
  amount: string;
  category: string;
  label: string;
  /** One per sheet opening, and the outbox item's id, so a resend records once. */
  idempotencyKey: string;
};

/**
 * Records a purchase through the phone's outbox, like the web: stored on the phone, then sent.
 * `sent`: refresh Home and History, tell the parent, a light haptic. `queued`: it waits on the
 * phone. `refused`: the child is right here to fix it, so it doesn't wait in the outbox.
 */
export function useRecordPurchase() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PurchasePayload): Promise<SubmitResult> => {
      const result = await submit({
        userId: userId as string,
        kind: "purchase",
        payload,
        idempotencyKey: payload.idempotencyKey,
      });
      if (result.status === "refused") {
        await removeItem(payload.idempotencyKey).catch(() => undefined);
      }
      return result;
    },
    onSuccess: (result) => {
      if (result.status !== "sent") return;
      const id = userId as string;
      void queryClient.invalidateQueries({ queryKey: keys.home(id) });
      void queryClient.invalidateQueries({ queryKey: keys.history(id) });
      dispatchNotices();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  });
}

/** The entry id in a `sent` reply (`{ status: "recorded", entryId }`), for Undo. */
export function sentEntryId(result: SubmitResult | undefined): string | null {
  if (result?.status !== "sent") return null;
  const data = result.data as { entryId?: unknown } | null | undefined;
  return typeof data?.entryId === "string" ? data.entryId : null;
}
