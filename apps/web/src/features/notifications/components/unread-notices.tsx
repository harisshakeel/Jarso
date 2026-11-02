"use client";

import { noticeHref, noticeText } from "../links";
import type { Notice } from "../types";
import { InboxItem } from "./inbox-item";
import { useOpenNotice } from "./use-open-notice";

/** Unread notices on the parent's Home, e.g. limit notices under "Needs you". View marks read. */
export function UnreadNotices({ items, currency }: { items: Notice[]; currency: string }) {
  const open = useOpenNotice();
  if (items.length === 0) return null;
  return (
    <ul aria-label="Notices" className="grid gap-2">
      {items.map((notice) => {
        const { title, detail } = noticeText(notice, "parent", currency);
        return (
          <li key={notice.id}>
            <InboxItem
              notice={notice}
              href={noticeHref(notice, "parent")}
              title={title}
              detail={detail}
              onOpen={open}
            />
          </li>
        );
      })}
    </ul>
  );
}
