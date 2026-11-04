import { pushDataSchema } from "@jarso/core/notifications";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { homeFor, useSession } from "@/features/auth";
import { noticeTargetRoute, useMarkRead } from "@/features/news";
import { logger } from "@/lib";

/**
 * Opens the screen a tapped push points at, once per tap. On a cold start it waits until the
 * session's role is known. A push meant for someone else (an account signed in on this phone
 * before) or one it can't read opens the role's Home and marks nothing; an overnight summary
 * opens News and leaves its notices unread; a notice is marked read and opened like the inbox.
 */
export function usePushTaps(): void {
  const response = Notifications.useLastNotificationResponse();
  const { status, userId } = useSession();
  const router = useRouter();
  const markRead = useMarkRead();
  const handled = useRef(new Set<string>());
  const role = status === "child" || status === "parent" ? status : undefined;

  useEffect(() => {
    if (!response || !role || !userId) return;
    const id = response.notification.request.identifier;
    if (handled.current.has(id)) return;
    handled.current.add(id);

    const parsed = pushDataSchema.safeParse(response.notification.request.content.data);
    if (!parsed.success || parsed.data.recipientId !== userId) {
      router.push(homeFor(role));
      return;
    }
    const data = parsed.data;
    if (data.kind === "summary") {
      router.push("/(child)/(tabs)/news");
      return;
    }
    markRead.mutate([data.noticeId], {
      onError: (error) =>
        logger.warn("Could not save notice as read", {
          error: error instanceof Error ? error.name : "unknown",
        }),
    });
    router.push(noticeTargetRoute(data.target, role));
  }, [response, role, userId, router, markRead]);
}
