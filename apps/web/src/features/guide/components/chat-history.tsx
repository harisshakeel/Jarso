"use client";

import type { ConversationSummary } from "@jarso/core/guide";
import { chatDay, chatTitle, guideCopy, guideUi } from "@jarso/core/guide";
import { HistoryIcon, MessageSquarePlusIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";
import { JarsoEyes } from "@/components/brand";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui";
import { cn } from "@/lib";

export { chatTitle } from "@jarso/core/guide";

const formatDay = chatDay;

/** The calendar day ("2026-11-03") an instant falls on in a timezone. */
function dayOf(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(instant);
}

export type ChatGroup = {
  key: "today" | "week" | "earlier";
  name: string;
  chats: ConversationSummary[];
};

/** Chats in three groups, newest first: today, the last seven days, and everything before. */
export function groupChats(chats: ConversationSummary[], now: Date, timezone: string): ChatGroup[] {
  const today = dayOf(now, timezone);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const groups: ChatGroup[] = [
    { key: "today", name: guideCopy.history.groups.today, chats: [] },
    { key: "week", name: guideCopy.history.groups.week, chats: [] },
    { key: "earlier", name: guideCopy.history.groups.earlier, chats: [] },
  ];
  for (const chat of chats) {
    const at = new Date(chat.lastMessageAt);
    const group = dayOf(at, timezone) === today ? 0 : at >= weekAgo ? 1 : 2;
    groups[group]?.chats.push(chat);
  }
  return groups.filter((group) => group.chats.length > 0);
}

/**
 * The past chats, out of the way behind one "History" button (design.md §6): a drawer with
 * "New chat" on top and the chats grouped by when they were last used, each with Jarso's eyes,
 * its first message and its day (and, for a parent, the child it is about). The open chat is
 * highlighted. Nothing about past chats shows until the drawer is opened.
 */
export function ChatHistory({
  chats,
  currentId,
  chatHref,
  newHref,
  timezone,
  names,
}: {
  chats: ConversationSummary[];
  currentId: string | null;
  /** The page's own path; a chat opens at `?chat=<id>` on it. */
  chatHref: Route;
  newHref: Route;
  timezone: string;
  /** A parent's list names the child each chat is about. */
  names?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const groups = open ? groupChats(chats, new Date(), timezone) : [];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" />}>
        <HistoryIcon aria-hidden />
        {guideCopy.history.button}
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{guideCopy.history.title}</SheetTitle>
          <SheetDescription className="sr-only">Past chats with Jarso.</SheetDescription>
        </SheetHeader>
        <nav aria-label={guideUi.pastChats} className="grid gap-4 px-4 pb-4">
          <Link
            href={newHref}
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-hairline-strong px-3 font-semibold hover:bg-muted"
          >
            <MessageSquarePlusIcon aria-hidden className="size-5" />
            {guideUi.newChat}
          </Link>
          {groups.length === 0 ? (
            <p className="px-1 text-ink-2 text-sm">{guideCopy.history.empty}</p>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="grid gap-1">
                <h3 className="eyebrow px-1">{group.name}</h3>
                <ul className="grid gap-1">
                  {group.chats.map((chat) => (
                    <li key={chat.id}>
                      <Link
                        href={`${chatHref}?chat=${chat.id}` as Route}
                        aria-current={chat.id === currentId ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted",
                          chat.id === currentId && "bg-secondary",
                        )}
                      >
                        <JarsoEyes size="md" />
                        <span className="grid min-w-0 gap-0.5">
                          <span className="truncate font-semibold">{chatTitle(chat)}</span>
                          <span className="text-ink-2 text-xs">
                            {formatDay(chat.lastMessageAt, timezone)}
                            {names?.[chat.childId] ? ` · ${names[chat.childId]}` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
