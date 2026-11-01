"use client";

import { useEffect } from "react";
import { JarsoMark } from "@/components/brand";
import { Button } from "@/components/ui";
import { logger } from "@/lib";

/** The route error boundary, on the empty-state recipe: mark, two beats, one pill (design.md §6). */
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    logger.error("Route error boundary", { error });
  }, [error]);

  return (
    <main className="rise-in flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <JarsoMark size={64} />
      <h2 className="text-balance text-h1">That didn't load. Let's try again.</h2>
      <p className="text-ink-2 text-lg">Check your connection, then tap the button.</p>
      <Button size="lg" onClick={retry}>
        Try again
      </Button>
    </main>
  );
}
