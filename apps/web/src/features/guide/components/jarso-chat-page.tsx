import type { ConversationSummary } from "@jarso/core/guide";
import type { Route } from "next";
import type { ReactNode } from "react";
import { ChatHistory } from "./chat-history";

/**
 * The Jarso page (design.md §6): the chat filling the page, like a chat app, with the past
 * chats out of sight behind one "History" button at the top. An empty chat is Jarso's face,
 * a greeting and the composer in the middle; a started chat is the thread with the composer at
 * its foot. The thread itself is `GuideThread`, the same piece as the window on Home.
 */
export function JarsoChatPage({
  chats,
  currentId,
  chatHref,
  newHref,
  timezone,
  names,
  children,
}: {
  chats: ConversationSummary[];
  currentId: string | null;
  /** The page's own path; a chat opens at `?chat=<id>` on it. */
  chatHref: Route;
  newHref: Route;
  timezone: string;
  names?: Record<string, string>;
  /** The thread. */
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-[calc(100svh-3.5rem-3rem)] grid-rows-[auto_1fr] gap-2">
      <div className="-ml-3 flex items-center">
        <ChatHistory
          chats={chats}
          currentId={currentId}
          chatHref={chatHref}
          newHref={newHref}
          timezone={timezone}
          names={names}
        />
      </div>
      <div className="min-h-0 min-w-0">{children}</div>
    </div>
  );
}
