"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CoachFigure, coachIdFor } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { logger } from "@/lib";

/**
 * A page that didn't load, on the empty-state recipe (design.md §6): a coach, two beats, and two
 * ways on: try again, or go home. Never a dead end. `as="main"` for the root boundary, which
 * stands alone; inside the app layout it is a plain block, so the layout's own <main> and the
 * navigation stay.
 */
export function RouteError({
  error,
  retry,
  as: Wrapper = "div",
}: {
  error: unknown;
  retry: () => void;
  as?: "main" | "div";
}) {
  useEffect(() => {
    logger.error("Route error boundary", { error });
  }, [error]);

  return (
    <Wrapper className="rise-in flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <CoachFigure coach={coachIdFor("error")} size={96} />
      <h1 className="text-balance text-h1">That didn't load. Let's try again.</h1>
      <p className="text-ink-2 text-lg">Check your connection, then tap the button.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={retry}>
          Try again
        </Button>
        <Link
          href={routes.dashboard}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Go home
        </Link>
      </div>
    </Wrapper>
  );
}
