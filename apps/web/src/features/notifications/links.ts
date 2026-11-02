import { type Notice, type NoticeRole, paymentItem } from "@jarso/core/notifications";
import type { Route } from "next";
import { routes } from "@/config";

/** Where a notice opens: the record as it is now, not as it was when the notice was sent. */
export function noticeHref(notice: Notice, role: NoticeRole): Route {
  if (role === "parent") {
    if (notice.sourceType === "payment") {
      const item = paymentItem(notice);
      return item ? routes.parentHandover(notice.childId, item.kind, item.id) : routes.parent;
    }
    if (notice.sourceType === "allowance_occurrence") {
      return routes.parentHandover(notice.childId, "allowance", notice.sourceId);
    }
    if (notice.sourceType === "request") return routes.parentChild(notice.childId);
    return routes.parentChildHistory(notice.childId);
  }
  return notice.sourceType === "ledger_entry" ? routes.childDiary : routes.child;
}
