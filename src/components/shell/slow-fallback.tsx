"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { offlineCopy } from "@/features/offline";

const RELOAD_AFTER = 5_000;

/**
 * A page skeleton that, once it has dragged on for `after` ms, offers a calm way to retry.
 * `router.refresh()` may not rescue a hung initial stream, so if this is still mounted
 * 5 s after Try again we reload the page.
 */
export function SlowFallback({
  after = 10_000,
  children,
}: {
  after?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);
  const [trying, setTrying] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), after);
    return () => clearTimeout(timer);
  }, [after]);

  useEffect(() => {
    if (!trying) return;
    const timer = setTimeout(() => window.location.reload(), RELOAD_AFTER);
    return () => clearTimeout(timer);
  }, [trying]);

  return (
    <>
      {children}
      <div role="status" className="mt-4">
        {slow ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-ink-2 text-sm">{offlineCopy.slow}</p>
            <Button
              type="button"
              variant="outline"
              disabled={trying}
              onClick={() => {
                setTrying(true);
                router.refresh();
              }}
            >
              {trying ? "Trying…" : "Try again"}
            </Button>
          </div>
        ) : null}
      </div>
    </>
  );
}
