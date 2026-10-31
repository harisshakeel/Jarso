import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import type { Notice, NoticeKind, NoticeSource } from "../types";

type Client = SupabaseClient<Database>;

type Row = {
  id: string;
  kind: string;
  child_id: string;
  source_type: string;
  source_id: string;
  payload: unknown;
  created_at: string;
  read_at: string | null;
  child: { nickname: string } | null;
};

/** Pure row to Notice mapping. */
export function toNotice(row: Row): Notice {
  const { payload } = row;
  return {
    id: row.id,
    kind: row.kind as NoticeKind,
    childId: row.child_id,
    childName: row.child?.nickname ?? "",
    sourceType: row.source_type as NoticeSource,
    sourceId: row.source_id,
    payload:
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    read: row.read_at !== null,
  };
}

const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}[T ][0-9:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?)\|([0-9a-f-]{36})$/i;

export const encodeCursor = (n: { createdAt: string; id: string }) => `${n.createdAt}|${n.id}`;

/** Parses a `<created_at>|<id>` cursor; anything else is a validation error. */
export function parseCursor(cursor: string): { createdAt: string; id: string } {
  const match = CURSOR_RE.exec(cursor);
  if (!match?.[1] || !match[2]) throw new AppError("VALIDATION", "That page is not available.");
  return { createdAt: match[1], id: match[2] };
}

/** Only place that knows notifications table, column and function names. RLS scopes rows to the caller. */
/** The caller's unread notices of some kinds, newest first. Filtered in the query, not after. */
export async function listUnreadRows(
  db: Client,
  kinds: NoticeKind[],
  limit: number,
): Promise<Notice[]> {
  const { data, error } = await db
    .from("notifications")
    .select(
      "id, kind, child_id, source_type, source_id, payload, created_at, read_at, child:profiles!notifications_child_id_fkey(nickname)",
    )
    .in("kind", kinds)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw toAppError(error, "Failed to load notices");
  return data.map((row) => toNotice(row as Row));
}

export async function listNoticeRows(
  db: Client,
  limit: number,
  before?: string,
): Promise<Notice[]> {
  let query = db
    .from("notifications")
    .select(
      "id, kind, child_id, source_type, source_id, payload, created_at, read_at, child:profiles!notifications_child_id_fkey(nickname)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (before) {
    const c = parseCursor(before);
    query = query.or(
      `created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw toAppError(error, "Failed to load notices");
  return data.map((row) => toNotice(row as Row));
}

export async function fetchUnreadCount(db: Client): Promise<number> {
  const { data, error } = await db.rpc("unread_notification_count");
  if (error) throw toAppError(error, "Failed to load unread count");
  return Number(data ?? 0);
}

/** `null` ids marks every unread notice of the caller. Returns how many changed. */
export async function setRead(db: Client, ids: string[] | null): Promise<number> {
  const { data, error } = await db.rpc(
    "mark_notifications_read",
    ids === null ? {} : { p_ids: ids },
  );
  if (error) throw toAppError(error, "Failed to mark as read");
  return Number(data ?? 0);
}
