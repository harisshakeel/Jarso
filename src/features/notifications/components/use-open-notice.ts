"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { logger } from "@/lib";
import { markNoticesReadAction } from "../server/actions";

/**
 * Opening a notice: save it as read (best effort, so offline or slow still reaches the record),
 * then go to the record. Modified clicks keep the browser's own behaviour.
 */
export function useOpenNotice() {
  const router = useRouter();
  return (id: string, event: MouseEvent<HTMLAnchorElement>) => {
    const href = event.currentTarget.getAttribute("href");
    if (!href || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    markNoticesReadAction(null, { ids: [id] }).then(
      (result) => {
        if (result.ok) router.refresh();
      },
      (error: unknown) => {
        logger.warn("Could not save notice as read", {
          error: error instanceof Error ? error.name : "unknown",
        });
      },
    );
    router.push(href as Route);
  };
}
