"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { offlineCopy, useOnline } from "@/features/offline";

const RELOAD_AFTER = 5_000;

/**
 * A page skeleton that, once it has dragged on for `after` ms, offers a calm way to retry.
 * `router.refresh()` may not rescue a hung initial stream, so if this is still mounted
 * 5 s after Try again we reload the page. Never offline: a reload then would swap the app for
 * the browser's offline page, so it shows the offline copy and waits instead.
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
  const online = useOnline();

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), after);
    return () => clearTimeout(timer);
  }, [after]);

  useEffect(() => {
    if (!trying) return;
    if (!online) {
      setTrying(false);
      return;
    }
    const timer = setTimeout(() => {
      if (navigator.onLine === false) setTrying(false);
      else window.location.reload();
    }, RELOAD_AFTER);
    return () => clearTimeout(timer);
  }, [trying, online]);

  return (
    <>
      {children}
      <div role="status" className="mt-4">
        {slow && !online ? (
          <p className="text-ink-2 text-sm">{offlineCopy.offline}</p>
        ) : slow ? (
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
