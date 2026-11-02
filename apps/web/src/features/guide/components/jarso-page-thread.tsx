"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { GuideThread, type GuideThreadProps } from "./guide-thread";

/**
 * The thread on the Jarso page. Once a new chat has its first reply, the page moves to that
 * chat's address, so the list down the side shows it and a refresh picks it up again.
 */
export function JarsoPageThread({
  chatHref,
  ...thread
}: Omit<GuideThreadProps, "variant" | "onChatStarted"> & {
  /** The page's own path; a started chat moves to `?chat=<id>` on it. A string, not a function:
   * a Server Component page renders this Client Component, and functions can't cross that line. */
  chatHref: Route;
}) {
  const router = useRouter();
  return (
    <GuideThread
      variant="page"
      onChatStarted={(id) => router.replace(`${chatHref}?chat=${id}` as Route, { scroll: false })}
      {...thread}
    />
  );
}
