import { type Notice, type NoticeRole, noticeTarget } from "@jarso/core/notifications";
import type { Route } from "next";
import { routes } from "@/config";

/** Where a notice opens on the web: the record as it is now, not as it was when it was sent. */
export function noticeHref(notice: Notice, role: NoticeRole): Route {
  const target = noticeTarget(notice, role);
  switch (target.to) {
    case "handover":
      return routes.parentHandover(target.childId, target.kind, target.id);
    case "child":
      return routes.parentChild(target.childId);
    case "child-history":
      return routes.parentChildHistory(target.childId);
    case "diary":
      return routes.childDiary;
    case "home":
      return role === "parent" ? routes.parent : routes.child;
  }
}
