"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { logger } from "@/lib";

export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    logger.error("Route error boundary", { error });
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="font-semibold text-xl">We couldn't load this</h2>
      <p className="text-ink-2">Check your connection and try again.</p>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
