"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { GuideThread, type GuideThreadProps } from "./guide-thread";

type Props = Omit<GuideThreadProps, "variant" | "onChatStarted"> & {
  /** The page's own path; a started chat moves to `?chat=<id>` on it. */
  chatHref: Route;
  /** The chat the address names, or null for a new one. */
  chatId: string | null;
  /** The "New chat" link's nonce, so clicking it starts over even from an unsaved new chat. */
  nonce: string | null;
};

/**
 * The thread on the Jarso page. Once a new chat has its first reply, the page moves to that
 * chat's address so the list down the side shows it and a refresh picks it up again. The thread
 * that started the chat keeps its live reply (topics, quick check and all) through that move:
 * it is re-keyed only for a chat picked from the list, or for a fresh "New chat".
 */
export function JarsoPageThread({ chatHref, chatId, nonce, reopened, ...thread }: Props) {
  const router = useRouter();
  const started = useRef<string | null>(null);
  // "New chat" clears the memory of the chat this thread started, so picking that chat from the
  // list later reopens it from the store instead of showing an empty thread.
  useEffect(() => {
    if (chatId === null) started.current = null;
  }, [chatId]);
  const own = chatId !== null && chatId === started.current;
  const key = chatId !== null && !own ? chatId : `new-${nonce ?? ""}`;
  return (
    <GuideThread
      key={key}
      variant="page"
      reopened={own ? undefined : reopened}
      onChatStarted={(id) => {
        started.current = id;
        router.replace(`${chatHref}?chat=${id}` as Route, { scroll: false });
      }}
      {...thread}
    />
  );
}
