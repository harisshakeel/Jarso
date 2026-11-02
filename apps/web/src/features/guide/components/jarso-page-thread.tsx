"use client";

import { useRouter } from "next/navigation";
import { GuideThread, type GuideThreadProps } from "./guide-thread";

/**
 * The thread on the Jarso page. Once a new chat has its first reply, the page's list of chats is
 * refreshed so the chat appears there; the address is left alone on purpose. Moving to
 * `?chat=<id>` re-keyed the thread, and the re-render replaced the live reply (topics, quick
 * check and all) with the stored version while the child was still reading it.
 */
export function JarsoPageThread(props: Omit<GuideThreadProps, "variant" | "onChatStarted">) {
  const router = useRouter();
  return <GuideThread variant="page" onChatStarted={() => router.refresh()} {...props} />;
}
