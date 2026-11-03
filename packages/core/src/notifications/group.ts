import type { Notice } from "./types";

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
