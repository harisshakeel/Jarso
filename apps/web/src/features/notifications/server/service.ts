import "server-only";
import type {
  ChildNoteInput,
  DevicePushTokenInput,
  NoteResult,
  Notice,
  NoticeKind,
  NoticePage,
  PushSubscriptionInput,
} from "@jarso/core/notifications";
import { assertUser } from "@/features/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fetchUnreadCount,
  hitRateLimit,
  insertChildNote,
  listUnreadRows,
  listNotices as loadNotices,
  ownsSubscription,
  removeDeviceToken,
  removeSubscription,
  saveDeviceToken,
  saveSubscription,
  markRead as setRead,
} from "./repository";

/** The caller's notices, newest first. `before` is the previous page's `nextBefore`. */
export async function listNotices(limit?: number, before?: string): Promise<NoticePage> {
  const user = await assertUser();
  return loadNotices(await createClient(), user.id, { limit, before });
}

export async function getUnreadCount(): Promise<number> {
  await assertUser();
  return fetchUnreadCount(await createClient());
}

/** Marks the given notices read, or all of the caller's when `ids` is null. */
export async function markRead(ids: string[] | null): Promise<number> {
  await assertUser();
  return setRead(await createClient(), ids);
}

/** Unread notices of some kinds, newest first, at most 20 (e.g. limit notices for "Needs you"). */
export async function listUnreadNotices(kinds: NoticeKind[]): Promise<Notice[]> {
  await assertUser();
  return listUnreadRows(await createClient(), kinds, 20);
}

/**
 * A parent's note to their child (parent dashboard). It lands in the child's News; the database
 * checks the caller is the child's parent. Never logs the text.
 */
export async function sendChildNote(input: ChildNoteInput): Promise<NoteResult> {
  await assertUser();
  return insertChildNote(await createClient(), input);
}

/**
 * Web push (FR16): keeps this browser's subscription for the caller. The user agent is cut to a
 * family (e.g. "Chrome on Android") before it is stored, enough to recognise a device later.
 */
export async function subscribePush(
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  await assertUser();
  await saveSubscription(await createClient(), input, describeAgent(userAgent));
}

/**
 * On a browser two accounts share, the browser's subscription may belong to the other account
 * (`push_subscribe` moves an endpoint to its latest subscriber). The switch shows "on" only
 * when the signed-in account owns it.
 */
export async function ownsPushEndpoint(endpoint: string): Promise<{ owned: boolean }> {
  await assertUser();
  return { owned: await ownsSubscription(await createClient(), endpoint) };
}

export async function unsubscribePush(endpoint: string): Promise<{ removed: boolean }> {
  await assertUser();
  return { removed: await removeSubscription(await createClient(), endpoint) };
}

/**
 * Phone push: stores this phone's Expo token for the signed-in member (parent or child), taking
 * it over from any account that used the phone before. The phone calls it after sign-in.
 */
export async function registerDeviceToken(input: DevicePushTokenInput): Promise<{ id: string }> {
  await assertUser();
  return { id: await saveDeviceToken(await createClient(), input) };
}

/** Phone push: forgets this phone's token for the signed-in member, before sign-out. */
export async function unregisterDeviceToken(token: string): Promise<{ removed: boolean }> {
  await assertUser();
  return { removed: await removeDeviceToken(await createClient(), token) };
}

const BROWSERS = ["Edg", "OPR", "SamsungBrowser", "Firefox", "Chrome", "Safari"] as const;
const DEVICES = ["Android", "iPhone", "iPad", "Windows", "Macintosh", "Linux"] as const;

/** "Chrome on Android" from a user agent string, or null. Never the raw string. */
export function describeAgent(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = BROWSERS.find((b) => userAgent.includes(b));
  const device = DEVICES.find((d) => userAgent.includes(d));
  if (!browser && !device) return null;
  const name = browser === "Edg" ? "Edge" : browser === "OPR" ? "Opera" : browser;
  return [name, device].filter(Boolean).join(" on ");
}

/** The mobile app's push trigger: 30 per user per 10 minutes. Counts every call; true if allowed. */
export async function allowDispatch(userId: string): Promise<boolean> {
  return hitRateLimit(createAdminClient(), `push:dispatch:${userId}`, "10 minutes", 30);
}
