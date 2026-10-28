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
      <h2 className="font-semibold text-xl">Something went wrong</h2>
      <Button onClick={retry}>Try again</Button>
    </main>
  );
}
