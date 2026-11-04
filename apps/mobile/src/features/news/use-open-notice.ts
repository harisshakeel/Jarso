import {
  type Notice,
  type NoticeRole,
  type NoticeTarget,
  noticeTarget,
} from "@jarso/core/notifications";
import { type Href, useRouter } from "expo-router";
import { logger } from "@/lib";
import { useMarkRead } from "./use-notices";

/**
 * Where a notice target opens on the phone, for the viewer's role (from core's `noticeTarget`).
 * Group-qualified: `/` and `/jarso` exist in both groups. Push taps use this too.
 */
export function noticeTargetRoute(target: NoticeTarget, role: NoticeRole): Href {
  if (role === "parent") {
    switch (target.to) {
      case "handover":
        return `/(parent)/children/${target.childId}/handover/${target.kind}/${target.id}` as Href;
      case "child":
        return `/(parent)/children/${target.childId}` as Href;
      case "child-history":
        return `/(parent)/children/${target.childId}/history` as Href;
      // A child's own records never reach a parent; Family is the safe place.
      default:
        return "/(parent)/(tabs)";
    }
  }
  switch (target.to) {
    case "diary":
      return "/(child)/(tabs)/diary";
    case "goal":
      return "/(child)/goal";
    case "jarso":
      return "/(child)/(tabs)/jarso";
    // Parent records (handover, a child's page) never reach a child; Home is the safe place.
    default:
      return "/(child)/(tabs)";
  }
}

/**
 * Opening a notice: save it as read (best effort, so offline or slow still reaches the record),
 * then go to the record.
 */
export function useOpenNotice(role: NoticeRole) {
  const router = useRouter();
  const markRead = useMarkRead();
  return (notice: Notice) => {
    if (!notice.read) {
      markRead.mutate([notice.id], {
        onError: (error) =>
          logger.warn("Could not save notice as read", {
            error: error instanceof Error ? error.name : "unknown",
          }),
      });
    }
    router.push(noticeTargetRoute(noticeTarget(notice, role), role));
  };
}
