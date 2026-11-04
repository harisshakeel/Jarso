import type { PaymentStatusView } from "@jarso/core/payments";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { isAppError } from "@/lib";
import { getPaymentStatus } from "./api";

const FAST_MS = 2_000;
const SLOW_MS = 5_000;
/** After this long without a final status, say the bank is still confirming and poll slower. */
const STILL_CONFIRMING_MS = 15_000;
const GIVE_UP_MS = 120_000;

/**
 * Reads a card payment's status back after the sheet closes: at once, then every 2 s, every 5 s
 * after 15 s (`stillConfirming`), until it is final or 2 minutes pass. A failed read keeps the
 * last view and polls on (the network may come back); a refused session stops. On a final
 * status every active query refreshes, so the handover, hub and history show the result.
 */
export function usePaymentStatus(paymentId: string | null): {
  view: PaymentStatusView | null;
  stillConfirming: boolean;
} {
  const queryClient = useQueryClient();
  const [state, setState] = useState<{
    id: string | null;
    view: PaymentStatusView | null;
    stillConfirming: boolean;
  }>({ id: paymentId, view: null, stillConfirming: false });

  // A new payment starts from nothing (adjusting state on a prop change, not in an effect).
  if (state.id !== paymentId) setState({ id: paymentId, view: null, stillConfirming: false });

  useEffect(() => {
    if (!paymentId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    async function tick() {
      try {
        const view = await getPaymentStatus(paymentId as string);
        if (stopped) return;
        setState((prev) => ({ ...prev, view }));
        if (view.final) {
          void queryClient.invalidateQueries({ refetchType: "active" });
          return;
        }
      } catch (error) {
        if (stopped || (isAppError(error) && error.code === "UNAUTHORIZED")) return;
      }
      const elapsed = Date.now() - started;
      if (elapsed >= GIVE_UP_MS) return;
      const slow = elapsed >= STILL_CONFIRMING_MS;
      if (slow)
        setState((prev) => (prev.stillConfirming ? prev : { ...prev, stillConfirming: true }));
      // The last read lands at the 2-minute mark, not after it.
      const delay = Math.min(slow ? SLOW_MS : FAST_MS, GIVE_UP_MS - elapsed);
      timer = setTimeout(() => void tick(), delay);
    }

    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [paymentId, queryClient]);

  return state.id === paymentId
    ? { view: state.view, stillConfirming: state.stillConfirming }
    : { view: null, stillConfirming: false };
}
