import type { ConversationSummary } from "@jarso/core/guide";
import { MessageSquarePlusIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib";

/** "Mon 2 Nov" in the family's timezone, not the server's. */
function formatDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** The first message, shortened, as the chat's title; a stored chat always has one. */
export function chatTitle(chat: ConversationSummary): string {
  const text = chat.preview.trim();
  if (!text) return chat.label;
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

function ChatLinks({
  chats,
  currentId,
  hrefFor,
  newHref,
  timezone,
  names,
}: {
  chats: ConversationSummary[];
  currentId: string | null;
  hrefFor: (id: string) => Route;
  newHref: Route;
  timezone: string;
  /** A parent's list names the child each chat is about. */
  names?: Record<string, string>;
}) {
  return (
    <nav aria-label="Past chats" className="grid gap-1">
      <Link
        href={newHref}
        className={cn(
          "flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold hover:bg-muted",
          currentId === null ? "bg-secondary text-foreground" : "text-primary",
        )}
      >
        <MessageSquarePlusIcon aria-hidden className="size-5" />
        New chat
      </Link>
      {chats.length === 0 ? (
        <p className="px-3 py-2 text-ink-2 text-sm">No chats yet.</p>
      ) : (
        <ul className="grid gap-1">
          {chats.map((chat) => (
            <li key={chat.id}>
              <Link
                href={hrefFor(chat.id)}
                aria-current={chat.id === currentId ? "page" : undefined}
                className={cn(
                  "grid min-h-11 gap-0.5 rounded-xl px-3 py-2 hover:bg-muted",
                  chat.id === currentId && "bg-secondary",
                )}
              >
                <span className="truncate font-semibold">{chatTitle(chat)}</span>
                <span className="text-ink-2 text-xs">
                  {formatDay(chat.lastMessageAt, timezone)}
                  {names?.[chat.childId] ? ` · ${names[chat.childId]}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

/**
 * The Jarso page (design.md §6): past chats down the left, the open chat filling the rest, the
 * composer at its foot, like a chat app. On phones the list folds into "Past chats" above the
 * thread. The thread itself is `GuideThread`, the same piece as the window on Home.
 */
export function JarsoChatPage({
  chats,
  currentId,
  hrefFor,
  newHref,
  timezone,
  names,
  children,
}: {
  chats: ConversationSummary[];
  currentId: string | null;
  hrefFor: (id: string) => Route;
  newHref: Route;
  timezone: string;
  names?: Record<string, string>;
  /** The thread. */
  children: ReactNode;
}) {
  const links = (
    <ChatLinks
      chats={chats}
      currentId={currentId}
      hrefFor={hrefFor}
      newHref={newHref}
      timezone={timezone}
      names={names}
    />
  );
  return (
    <div className="grid min-h-[calc(100svh-3.5rem-3rem)] gap-4 lg:grid-cols-[16rem_1fr] lg:gap-8">
      <details className="rounded-xl border border-hairline bg-card p-2 lg:hidden">
        <summary className="min-h-11 cursor-pointer px-2 py-2 font-semibold">Past chats</summary>
        {links}
      </details>
      <aside className="hidden lg:block">
        <div className="sticky top-20 max-h-[calc(100svh-6rem)] overflow-y-auto pr-1">{links}</div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
