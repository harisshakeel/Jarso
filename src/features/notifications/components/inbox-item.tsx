"use client";

import { cn } from "cn";
import {
  BellIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  HandCoinsIcon,
  type LucideIcon,
  PiggyBankIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { MouseEvent } from "react";
import type { Notice, NoticeKind } from "../types";

// Tinted circles follow design.md §2.5: cyan for due, gold for limits, teal for decisions.
const kindStyle: Record<NoticeKind, { icon: LucideIcon; tint: string }> = {
  allowance_due: { icon: CalendarClockIcon, tint: "bg-cyan-100 text-cyan-700" },
  handover_reminder: { icon: HandCoinsIcon, tint: "bg-cyan-100 text-cyan-700" },
  limit_exceeded: { icon: BellIcon, tint: "bg-gold-100 text-gold-700" },
  withdrawal_requested: { icon: PiggyBankIcon, tint: "bg-secondary text-ink-2" },
  deposit_requested: { icon: PiggyBankIcon, tint: "bg-secondary text-ink-2" },
  withdrawal_decided: { icon: CheckCircle2Icon, tint: "bg-teal-100 text-teal-800" },
  deposit_decided: { icon: CheckCircle2Icon, tint: "bg-teal-100 text-teal-800" },
};

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function timeAgo(createdAt: string, now: number): string {
  const elapsed = Math.max(0, now - new Date(createdAt).getTime());
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  return relative.format(-Math.floor(elapsed / DAY), "day");
}

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
        <Icon className="size-5" />
      </span>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn("truncate", notice.read ? "font-semibold" : "font-extrabold")}>
          {title}
          {notice.read ? null : <span className="sr-only"> (new)</span>}
        </span>
        <span className="truncate text-ink-2 text-sm">{detail}</span>
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
