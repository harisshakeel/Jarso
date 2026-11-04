import { pushDataSchema } from "@jarso/core/notifications";
import * as Notifications from "expo-notifications";
import { useRootNavigationState, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { homeFor, useSession } from "@/features/auth";
import { noticeTargetRoute, useMarkRead } from "@/features/news";
import { logger } from "@/lib";

/**
 * Opens the screen a tapped push points at, once per tap.
 * - Cold start: waits while the session is loading and until the navigator is ready, then
 *   navigates on the next tick, after the role layouts' redirects.
 * - A tap while signed out (or unreachable) is dropped, never replayed after the next sign-in.
 * - A push meant for someone else (an account signed in on this phone before) or one it can't
 *   read goes to the role's Home and marks nothing; an overnight summary opens Updates and leaves
 *   its notices unread; a notice is marked read and opened like the inbox.
 * - The handled response is cleared, so a recreated app doesn't open it again.
 */
export function usePushTaps(): void {
  const response = Notifications.useLastNotificationResponse();
  const { status, userId } = useSession();
  const router = useRouter();
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  const { mutate: markRead } = useMarkRead();
  const markReadRef = useRef(markRead);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  useEffect(() => {
    if (!response || status === "loading") return;
    const id = response.notification.request.identifier;
    if (handled.current.has(id)) return;
    const role = status === "child" || status === "parent" ? status : undefined;
    if (!role || !userId) {
      handled.current.add(id);
      Notifications.clearLastNotificationResponse();
      return;
    }
    if (!navigatorReady) return;
    handled.current.add(id);
    Notifications.clearLastNotificationResponse();

    const parsed = pushDataSchema.safeParse(response.notification.request.content.data);
    // Not cancelled on re-render: the tap is already marked handled, so it must still navigate.
    setTimeout(() => {
      if (!parsed.success || parsed.data.recipientId !== userId) {
        router.navigate(homeFor(role));
        return;
      }
      const data = parsed.data;
      if (data.kind === "summary") {
        router.push("/(child)/(tabs)/news");
        return;
      }
      markReadRef.current([data.noticeId], {
        onError: (error) =>
          logger.warn("Could not save notice as read", {
            error: error instanceof Error ? error.name : "unknown",
          }),
      });
      router.push(noticeTargetRoute(data.target, role));
    }, 0);
  }, [response, status, userId, navigatorReady, router]);
}
