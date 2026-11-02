import type { ConversationSummary, TranscriptMessage } from "@jarso/core/guide";
import {
  BotIcon,
  ChevronRightIcon,
  FlagIcon,
  ScanSearchIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { cn } from "@/lib";
import { GuideSwitch } from "./guide-switch";

/** Times in the family's timezone, not the server's. */
function formatWhen(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** The parent's Jarso card on a child's page: the switch, flagged chats, and a link to all chats. */
export function GuideCard({
  childId,
  nickname,
  enabled,
  flagged,
  href,
}: {
  childId: string;
  nickname: string;
  enabled: boolean;
  flagged: number;
  href: Route;
}) {
  return (
    <Card>
      <CardContent>
        <section aria-labelledby="guide-card" className="grid gap-3">
          <h2 id="guide-card" className="flex items-center gap-2 text-h3">
            <BotIcon aria-hidden className="size-5" />
            Jarso, the AI helper
          </h2>
          <GuideSwitch childId={childId} nickname={nickname} enabled={enabled} detail="short" />
          {flagged > 0 ? (
            <p className="flex items-center gap-2 font-semibold text-gold-700 dark:text-gold-200">
              <FlagIcon aria-hidden className="size-4" />
              {flagged === 1 ? "1 chat is worth a look." : `${flagged} chats are worth a look.`}
            </p>
          ) : null}
          <Link
            href={href}
            className="inline-flex min-h-11 w-fit items-center gap-1 rounded-full font-semibold text-primary underline-offset-4 hover:underline"
          >
            Read {nickname}'s chats
            <ChevronRightIcon aria-hidden className="size-5" />
          </Link>
        </section>
      </CardContent>
    </Card>
  );
}

/** Every chat, flagged first (spec decision 2). */
export function ChatList({
  chats,
  hrefFor,
  timezone,
}: {
  chats: ConversationSummary[];
  hrefFor: (id: string) => Route;
  timezone: string;
}) {
  if (chats.length === 0) return <p className="text-ink-2">No chats yet.</p>;
  return (
    <ul className="grid gap-2" aria-label="Chats">
      {chats.map((chat) => (
        <li key={chat.id}>
          <Link
            href={hrefFor(chat.id)}
            className={cn(
              "grid gap-1 rounded-xl border bg-card px-4 py-3 hover:bg-muted",
              chat.flagged ? "border-gold bg-gold-100/40 dark:bg-gold-900/30" : "border-hairline",
            )}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">{chat.label}</span>
              <span className="text-ink-2">{formatWhen(chat.lastMessageAt, timezone)}</span>
            </span>
            {chat.flagged ? (
              <span className="flex items-center gap-1 font-semibold text-gold-700 dark:text-gold-200">
                <FlagIcon aria-hidden className="size-4" />
                Worth a look
              </span>
            ) : null}
            <span className="line-clamp-2 text-ink-2">{chat.preview}</span>
            <span className="text-ink-2">
              {chat.turns} {chat.turns === 1 ? "question" : "questions"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const ROUTE_NOTES: Partial<Record<NonNullable<TranscriptMessage["route"]>, string>> = {
  off_topic: "Jarso steered back to money",
  personal_info: "Personal details were not kept",
  safety: "Jarso showed the helplines",
  unsafe: "Jarso said no to this",
  jailbreak: "Jarso stayed Jarso",
  blocked_output: "Jarso's reply was held back",
  unavailable: "Jarso was not available",
};

/** One chat as the parent reads it. Messages that got a safety response stay private. */
export function Transcript({
  messages,
  timezone,
  nickname = "Your child",
}: {
  messages: TranscriptMessage[];
  timezone: string;
  /** The child's name on their bubbles; "Your child" when unknown. */
  nickname?: string;
}) {
  return (
    <ol className="grid gap-3" aria-label="Chat">
      {messages.map((message) => (
        <li
          key={message.id}
          className={cn(
            "grid gap-1 rounded-2xl px-4 py-3",
            message.role === "child"
              ? "ml-8 justify-self-end bg-secondary"
              : "mr-8 bg-card shadow-rest",
          )}
        >
          <span className="font-semibold text-ink-2 text-sm">
            {message.role === "child"
              ? nickname
              : message.role === "guide"
                ? "Jarso (AI)"
                : "Jarso (set reply)"}
            {" · "}
            {formatWhen(message.createdAt, timezone)}
          </span>
          <p className={cn("whitespace-pre-line", message.hidden && "text-ink-2 italic")}>
            {message.text}
          </p>
          {message.lookedAt.length > 0 ? (
            <span className="flex items-center gap-1 text-ink-2">
              <ScanSearchIcon aria-hidden className="size-4" />
              Looked at: {message.lookedAt.join(", ")}
            </span>
          ) : null}
          {message.route && ROUTE_NOTES[message.route] ? (
            <span
              className={cn(
                "flex items-center gap-1",
                message.flagged ? "font-semibold text-gold-700 dark:text-gold-200" : "text-ink-2",
              )}
            >
              {message.flagged ? <FlagIcon aria-hidden className="size-4" /> : null}
              {ROUTE_NOTES[message.route]}
            </span>
          ) : null}
          {message.rating ? (
            <span className="flex items-center gap-1 text-ink-2">
              {message.rating === 1 ? (
                <ThumbsUpIcon aria-hidden className="size-4" />
              ) : (
                <ThumbsDownIcon aria-hidden className="size-4" />
              )}
              {message.rating === 1
                ? "Your child found this helpful"
                : "Your child didn't find this helpful"}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
