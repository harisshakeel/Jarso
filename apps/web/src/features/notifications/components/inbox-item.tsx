"use client";

import { inboxCopy, type Notice, type NoticeKind, timeAgo } from "@jarso/core/notifications";
import { cn } from "cn";
import {
  BellIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CreditCardIcon,
  HandCoinsIcon,
  type LucideIcon,
  MessageCircleHeartIcon,
  PencilIcon,
  PiggyBankIcon,
  SparklesIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { MouseEvent } from "react";
import { JarsoMark } from "@/components/brand";

// Tinted circles follow design.md §2.5: cyan for due, gold for limits and failed card charges,
// teal for decisions. A "Jarso noticed" nudge shows the Jarso mark instead of an icon.
const kindStyle: Record<NoticeKind, { icon: LucideIcon; tint: string }> = {
  allowance_due: {
    icon: CalendarClockIcon,
    tint: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  },
  handover_reminder: {
    icon: HandCoinsIcon,
    tint: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  },
  limit_exceeded: {
    icon: BellIcon,
    tint: "bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold",
  },
  withdrawal_requested: { icon: PiggyBankIcon, tint: "bg-secondary text-ink-2" },
  deposit_requested: { icon: PiggyBankIcon, tint: "bg-secondary text-ink-2" },
  withdrawal_decided: {
    icon: CheckCircle2Icon,
    tint: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  },
  deposit_decided: {
    icon: CheckCircle2Icon,
    tint: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  },
  emergency_requested: {
    icon: HandCoinsIcon,
    tint: "bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold",
  },
  emergency_decided: {
    icon: CheckCircle2Icon,
    tint: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  },
  // Informational, like a limit notice: never red (design.md §2.4).
  card_charge_failed: {
    icon: CreditCardIcon,
    tint: "bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold",
  },
  money_received: {
    icon: HandCoinsIcon,
    tint: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  },
  entry_corrected: { icon: PencilIcon, tint: "bg-secondary text-ink-2" },
  jar_moved: {
    icon: PiggyBankIcon,
    tint: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  },
  guide_noticed: { icon: SparklesIcon, tint: "bg-secondary text-ink-2" },
  parent_note: {
    icon: MessageCircleHeartIcon,
    tint: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  },
};

type InboxItemProps = {
  notice: Notice;
  href: Route | string;
  title: string;
  detail: string;
  /** Called when the row is opened, with the click event so the caller can finish a save first. */
  onOpen?: (id: string, event: MouseEvent<HTMLAnchorElement>) => void;
};

/** One inbox row (design.md §6): tinted icon, title, detail, relative time, chevron. */
export function InboxItem({ notice, href, title, detail, onOpen }: InboxItemProps) {
  const { icon: Icon, tint } = kindStyle[notice.kind] ?? kindStyle.limit_exceeded;
  return (
    <Link
      href={href as Route}
      data-unread={notice.read ? "false" : "true"}
      onClick={(event) => onOpen?.(notice.id, event)}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl border border-hairline px-4 py-3 hover:bg-muted",
        notice.read ? "bg-card" : "bg-teal-100 dark:bg-teal-900/40",
      )}
    >
      <span
        aria-hidden
        className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", tint)}
      >
        {notice.kind === "guide_noticed" ? <JarsoMark size={28} /> : <Icon className="size-5" />}
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn("truncate", notice.read ? "font-semibold" : "font-extrabold")}>
          {title}
          {notice.read ? null : <span className="sr-only">{inboxCopy.unread}</span>}
        </span>
        {/* A parent's note is the message itself, so it is shown whole. */}
        <span
          className={cn(
            "text-ink-2 text-sm",
            notice.kind === "parent_note" ? "break-words" : "truncate",
          )}
        >
          {detail}
        </span>
      </span>
      <time
        dateTime={notice.createdAt}
        suppressHydrationWarning
        className="shrink-0 text-ink-2 text-xs"
      >
        {timeAgo(notice.createdAt, Date.now())}
      </time>
      <ChevronRightIcon aria-hidden className="size-5 shrink-0 text-ink-2" />
    </Link>
  );
}
