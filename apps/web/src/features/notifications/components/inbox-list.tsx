"use client";

import type { Notice } from "@jarso/core/notifications";
import { groupNotices, inboxCopy, noticeText } from "@jarso/core/notifications";
import type { Route } from "next";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { CoachSays } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui";
import { runOnline } from "@/features/offline";
import { noticeHref } from "../links";
import { markNoticesReadAction } from "../server/actions";
import { InboxItem } from "./inbox-item";
import { useOpenNotice } from "./use-open-notice";

export { groupNotices, type NoticeGroup } from "@jarso/core/notifications";

type InboxListProps = {
  items: Notice[];
  currency: string;
  viewer: "parent" | "child";
  /** Link to the next older page, when there is one. */
  moreHref?: Route | null;
};

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
      <div className="rounded-xl border border-hairline bg-card p-5">
        <CoachSays coach={{ key: "inbox" }} says={{ moment: "nothingNew" }} />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {hasUnread ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" disabled={pending} onClick={markAll}>
            {inboxCopy.markAll}
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
          {inboxCopy.showMore}
        </Link>
      ) : null}
    </div>
  );
}
