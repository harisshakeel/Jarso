import { type Notice, noticeTarget } from "@jarso/core/notifications";
import { type Href, useRouter } from "expo-router";
import { logger } from "@/lib";
import { useMarkRead } from "./use-notices";

/** Where a notice opens on the phone: the record as it is now (core's `noticeTarget`). */
export function noticeRoute(notice: Notice): Href {
  const target = noticeTarget(notice, "child");
  switch (target.to) {
    case "diary":
      return "/(child)/(tabs)/diary";
    case "goal":
      return "/(child)/goal";
    case "jarso":
      return "/(child)/(tabs)/jarso";
    // Parent records (handover, a child's page) never reach a child; Home is the safe place.
    case "home":
    case "handover":
    case "child":
    case "child-history":
      return "/(child)/(tabs)";
  }
}

/**
 * Opening a notice: save it as read (best effort, so offline or slow still reaches the record),
 * then go to the record.
 */
export function useOpenNotice() {
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
    router.push(noticeRoute(notice));
  };
}
