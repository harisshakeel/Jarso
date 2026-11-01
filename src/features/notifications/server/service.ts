import "server-only";
import { assertUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { Notice, NoticeKind, NoticePage, PushSubscriptionInput } from "../types";
import {
  encodeCursor,
  fetchUnreadCount,
  listNoticeRows,
  listUnreadRows,
  ownsSubscription,
  removeSubscription,
  saveSubscription,
  setRead,
} from "./repository";

const PAGE_SIZE = 20;

/**
 * The caller's notices, newest first. `before` is the previous page's `nextBefore` (`<created_at>|<id>`).
 * Fetches one extra row only to learn whether another page exists, so an exactly full last page
 * gets no "Show more".
 */
export async function listNotices(limit = PAGE_SIZE, before?: string): Promise<NoticePage> {
  await assertUser();
  const rows = await listNoticeRows(await createClient(), limit + 1, before);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextBefore: rows.length > limit && last ? encodeCursor(last) : null };
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
