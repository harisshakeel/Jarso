import "server-only";
import { assertUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { NoticePage } from "../types";
import { encodeCursor, fetchUnreadCount, listNoticeRows, setRead } from "./repository";

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
