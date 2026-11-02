"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { cancelCardPaymentAction } from "../server/actions";

type CardCancelledReturnProps = {
  childId: string;
  kind: "allowance" | "gift";
  /** The occurrence or gift id. */
  id: string;
};

/**
 * Rendered on the handover screen when the provider sends the parent back with `?card=cancelled`.
 * Cancels their abandoned checkout for this item once, so it stops showing as in progress, then
 * drops `?card` from the URL (which re-renders the screen, and a reload won't cancel again).
 * Runs after render from the client: nothing mutates during a server render. Renders nothing.
 */
export function CardCancelledReturn({ childId, kind, id }: CardCancelledReturnProps) {
  const router = useRouter();
  const pathname = usePathname();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // A failed cancel is harmless: the checkout simply expires on its own.
    const done = () => router.replace(pathname as Route, { scroll: false });
    cancelCardPaymentAction(null, { childId, kind, id }).then(done, done);
  }, [childId, kind, id, pathname, router]);

  return null;
}
