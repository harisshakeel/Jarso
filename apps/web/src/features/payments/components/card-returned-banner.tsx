"use client";

import { paymentCopy } from "@jarso/core/payments";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_MS = 3_000;
const MAX_REFRESHES = 5;

/**
 * Shown on the handover screen after the provider sends the parent back from a paid checkout.
 * The return never posts money; the webhook does, so the screen re-reads a few times until the
 * item is handed over. With `handled` (the item is already handed over) it says so and still
 * re-reads a few times: a card payment that lands after a cash handover shows its refund note
 * only once the webhook has marked it.
 */
export function CardReturnedBanner({ handled = false }: { handled?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      router.refresh();
      if (count >= MAX_REFRESHES) clearInterval(timer);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-xl bg-teal-100 px-4 py-3 font-semibold text-sm text-teal-800 dark:bg-teal-900 dark:text-teal-100"
    >
      {handled ? (
        <CheckIcon aria-hidden className="size-5 shrink-0" />
      ) : (
        <Loader2Icon
          aria-hidden
          className="size-5 shrink-0 animate-spin motion-reduce:animate-none"
        />
      )}
      {handled ? paymentCopy.received : paymentCopy.returned}
    </p>
  );
}
