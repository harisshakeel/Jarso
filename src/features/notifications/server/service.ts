import "server-only";
import { assertUser } from "@/features/auth/server";
import { createClient } from "@/lib/supabase/server";
import type { NoticePage } from "../types";
import { fetchUnreadCount, listNoticeRows, setRead } from "./repository";

const PAGE_SIZE = 20;

/** The caller's notices, newest first. `before` is the previous page's `nextBefore`. */
export async function listNotices(limit = PAGE_SIZE, before?: string): Promise<NoticePage> {
  await assertUser();
  const items = await listNoticeRows(await createClient(), limit, before);
  const last = items.at(-1);
  return { items, nextBefore: items.length === limit && last ? last.createdAt : null };
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
