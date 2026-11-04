import { pushDataSchema } from "@jarso/core/notifications";
import * as Notifications from "expo-notifications";

const HIDDEN: Notifications.NotificationBehavior = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
};

/**
 * A push that arrives while the app is open. The signed-in user's own one goes to the shade
 * without a banner (the in-app toast already shows it); anything else (another account's, or
 * unreadable) is not shown at all.
 */
export function pushPresentation(
  data: unknown,
  userId: string | undefined,
): Notifications.NotificationBehavior {
  const parsed = pushDataSchema.safeParse(data);
  if (!userId || !parsed.success || parsed.data.recipientId !== userId) return HIDDEN;
  return { ...HIDDEN, shouldShowList: true };
}

/**
 * Wires `pushPresentation` into expo-notifications for the user signed in at arrival. Returns
 * the uninstall function.
 */
export function installForegroundHandler(getUserId: () => string | undefined): () => void {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) =>
      pushPresentation(notification.request.content.data, getUserId()),
  });
  return () => Notifications.setNotificationHandler(null);
}
