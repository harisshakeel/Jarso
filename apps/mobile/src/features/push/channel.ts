import * as Notifications from "expo-notifications";

/** The one Android channel every Jarso push lands in (also `defaultChannel` in app.json). */
export const NOTICE_CHANNEL = "notices";

/** Creates the channel. Android 13 shows the permission prompt only once a channel exists. */
export async function ensureNoticeChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(NOTICE_CHANNEL, {
    name: "Notices",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
