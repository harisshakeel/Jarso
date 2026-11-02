"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { GuideThread, type GuideThreadProps } from "./guide-thread";

/**
 * The thread on the Jarso page. Once a new chat has its first reply, the page moves to that
 * chat's address, so the list down the side shows it and a refresh picks it up again.
 */
export function JarsoPageThread({
  hrefFor,
  ...thread
}: Omit<GuideThreadProps, "variant" | "onChatStarted"> & { hrefFor: (id: string) => Route }) {
  const router = useRouter();
  return (
    <GuideThread
      variant="page"
      onChatStarted={(id) => router.replace(hrefFor(id), { scroll: false })}
      {...thread}
    />
  );
}
