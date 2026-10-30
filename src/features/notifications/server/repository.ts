import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toAppError } from "@/lib";
import type { Database } from "@/types";
import type { Notice, NoticeKind, NoticeSource } from "../types";

type Client = SupabaseClient<Database>;

/** Only place that knows notifications table, column and function names. RLS scopes rows to the caller. */
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
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw toAppError(error, "Failed to load notices");
  return data.map((row) => ({
    id: row.id,
    kind: row.kind as NoticeKind,
    childId: row.child_id,
    childName: row.child?.nickname ?? "",
    sourceType: row.source_type as NoticeSource,
    sourceId: row.source_id,
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    createdAt: row.created_at,
    read: row.read_at !== null,
  }));
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
