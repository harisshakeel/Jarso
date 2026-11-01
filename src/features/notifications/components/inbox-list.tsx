"use client";

import { InboxIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { noticeHref, noticeText } from "../links";
import { markNoticesReadAction } from "../server/actions";
import type { Notice } from "../types";
import { InboxItem } from "./inbox-item";
import { useOpenNotice } from "./use-open-notice";

type InboxListProps = {
  items: Notice[];
  currency: string;
  viewer: "parent" | "child";
  /** Link to the next older page, when there is one. */
  moreHref?: Route | null;
};

const DAY = 24 * 60 * 60 * 1000;

export type NoticeGroup = { label: "Today" | "This week" | "Older"; items: Notice[] };

/** Splits notices (newest first) into Today, This week and Older, keeping the order; empty groups are left out. */
export function groupNotices(items: Notice[], now = Date.now()): NoticeGroup[] {
  const groups: NoticeGroup[] = [
    { label: "Today", items: [] },
    { label: "This week", items: [] },
    { label: "Older", items: [] },
  ];
  for (const notice of items) {
    const age = now - new Date(notice.createdAt).getTime();
    const group = age < DAY ? groups[0] : age < 7 * DAY ? groups[1] : groups[2];
    group?.items.push(notice);
  }
  return groups.filter((group) => group.items.length > 0);
}

/** The inbox, newest first and grouped by day. Opening a row saves it as read, then goes to the record. */
export function InboxList({ items, currency, viewer, moreHref }: InboxListProps) {
  const open = useOpenNotice();
  const [pending, startTransition] = useTransition();
  const hasUnread = items.some((item) => !item.read);

  function markAll() {
    startTransition(async () => {
      const result = await runOnline(() => markNoticesReadAction(null, { ids: null }));
      if (!result.ok) toast.error(result.error.message);
    });
  }

  if (items.length === 0) {
    return (
      <div className="grid justify-items-center gap-2 rounded-xl border border-hairline bg-card p-8 text-center">
        <InboxIcon aria-hidden className="size-8 text-ink-2" />
        <p className="font-semibold">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {hasUnread ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={markAll}>
            Mark all as read
          </Button>
        </div>
      ) : null}
      {groupNotices(items).map((group) => (
        <section key={group.label} aria-label={group.label} className="grid gap-2">
          <h2 className="eyebrow">{group.label}</h2>
          <ul className="grid gap-2">
            {group.items.map((notice) => {
              const { title, detail } = noticeText(notice, viewer, currency);
              return (
                <li key={notice.id}>
                  <InboxItem
                    notice={notice}
                    href={noticeHref(notice, viewer)}
                    title={title}
                    detail={detail}
                    onOpen={open}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {moreHref ? (
        <Link href={moreHref} className={buttonVariants({ variant: "outline" })}>
          Show more
        </Link>
      ) : null}
    </div>
  );
}
