"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { offlineCopy } from "@/features/offline";

/** A page skeleton that, once it has dragged on for `after` ms, offers a calm way to retry. */
export function SlowFallback({
  after = 10_000,
  children,
}: {
  after?: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), after);
    return () => clearTimeout(timer);
  }, [after]);

  return (
    <>
      {children}
      {slow ? (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-ink-2 text-sm">{offlineCopy.slow}</p>
          <Button type="button" variant="outline" onClick={() => router.refresh()}>
            Try again
          </Button>
        </div>
      ) : null}
    </>
  );
}
