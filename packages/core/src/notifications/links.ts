import { type NoticeRole, paymentItem } from "./text";
import type { Notice } from "./types";

/** Where a notice opens, as a screen each app maps to its own route. */
export type NoticeTarget =
  /** A parent's handover screen for one due allowance or gift. */
  | { to: "handover"; childId: string; kind: "allowance" | "gift"; id: string }
  /** A parent's page for the child. */
  | { to: "child"; childId: string }
  /** A parent's view of the child's history. */
  | { to: "child-history"; childId: string }
  /** The child's own diary. */
  | { to: "diary" }
  /** The child's savings goal. */
  | { to: "goal" }
  /** The child's chats with Jarso. */
  | { to: "jarso" }
  /** The viewer's own Home (parent or child). */
  | { to: "home" };

/** Where a "Jarso noticed" nudge opens: the page it is about, named when it was sent. */
function noticedTarget(notice: Notice, role: NoticeRole): NoticeTarget {
  const { open } = notice.payload;
  if (role === "parent") {
    return open === "history"
      ? { to: "child-history", childId: notice.childId }
      : { to: "child", childId: notice.childId };
  }
  if (open === "goal") return { to: "goal" };
  if (open === "jarso") return { to: "jarso" };
  return { to: "home" };
}

/** Where a notice opens: the record as it is now, not as it was when the notice was sent. */
export function noticeTarget(notice: Notice, role: NoticeRole): NoticeTarget {
  if (notice.kind === "guide_noticed") return noticedTarget(notice, role);
  if (role === "parent") {
    if (notice.sourceType === "payment") {
      const item = paymentItem(notice);
      return item ? { to: "handover", childId: notice.childId, ...item } : { to: "home" };
    }
    if (notice.sourceType === "allowance_occurrence") {
      return { to: "handover", childId: notice.childId, kind: "allowance", id: notice.sourceId };
    }
    if (notice.sourceType === "request") return { to: "child", childId: notice.childId };
    return { to: "child-history", childId: notice.childId };
  }
  return notice.sourceType === "ledger_entry" ? { to: "diary" } : { to: "home" };
}
