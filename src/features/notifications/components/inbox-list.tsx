"use client";

import { InboxIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui";
import { logger } from "@/lib";
import { noticeHref, noticeText } from "../links";
import { markNoticesReadAction } from "../server/actions";
import type { Notice } from "../types";
import { InboxItem } from "./inbox-item";

type InboxListProps = {
  items: Notice[];
  currency: string;
  viewer: "parent" | "child";
  /** Link to the next older page, when there is one. */
  moreHref?: Route | null;
};

/** The inbox, newest first. Opening a row saves it as read, then goes to the record. */
export function InboxList({ items, currency, viewer, moreHref }: InboxListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hasUnread = items.some((item) => !item.read);

  function open(id: string, event: MouseEvent<HTMLAnchorElement>) {
    const href = event.currentTarget.getAttribute("href");
    if (!href || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    // Saving "read" is best effort: offline or slow, the child still gets to the record.
    markNoticesReadAction(null, { ids: [id] })
      .catch((error: unknown) => {
        logger.warn("Could not save notice as read", {
          error: error instanceof Error ? error.name : "unknown",
        });
      })
      .finally(() => router.refresh());
    router.push(href as Route);
  }

  function markAll() {
    startTransition(async () => {
      const result = await markNoticesReadAction(null, { ids: null });
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
      <ul className="grid gap-2">
        {items.map((notice) => {
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
      {moreHref ? (
        <Link href={moreHref} className={buttonVariants({ variant: "outline" })}>
          Show more
        </Link>
      ) : null}
    </div>
  );
}
