import { AppError, toAppError } from "@jarso/core/lib";
import type {
  NoteResult,
  Notice,
  NoticeKind,
  NoticePage,
  NoticeSource,
} from "@jarso/core/notifications";
import type { Database, Tables } from "@jarso/db";
// Only place that knows the notifications table and its reads. RLS scopes rows to the caller.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Client = SupabaseClient<Database>;

/** A notifications row with the child's nickname joined. */
export type NoticeRow = {
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

const PAGE_SIZE = 20;

const COLUMNS =
  "id, kind, child_id, source_type, source_id, payload, created_at, read_at, child:profiles!notifications_child_id_fkey(nickname)";

function asPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

/** Pure row to Notice mapping. */
export function toNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    kind: row.kind as NoticeKind,
    childId: row.child_id,
    childName: row.child?.nickname ?? "",
    sourceType: row.source_type as NoticeSource,
    sourceId: row.source_id,
    payload: asPayload(row.payload),
    createdAt: row.created_at,
    read: row.read_at !== null,
  };
}

/** Raw row to Notice. Realtime rows carry no join, so the child's name is left blank. */
export function rowToNotice(row: Tables<"notifications">): Notice {
  return toNotice({ ...row, child: null });
}

const CURSOR_RE = /^(\d{4}-\d{2}-\d{2}[T ][0-9:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?)\|([0-9a-f-]{36})$/i;

export const encodeCursor = (n: { createdAt: string; id: string }) => `${n.createdAt}|${n.id}`;

/** Parses a `<created_at>|<id>` cursor; anything else is a validation error. */
export function parseCursor(cursor: string): { createdAt: string; id: string } {
  const match = CURSOR_RE.exec(cursor);
  if (!match?.[1] || !match[2]) throw new AppError("VALIDATION", "That page is not available.");
  return { createdAt: match[1], id: match[2] };
}

/** The caller's unread notices of some kinds, newest first. Filtered in the query, not after. */
export async function listUnreadRows(
  db: Client,
  kinds: NoticeKind[],
  limit: number,
): Promise<Notice[]> {
  const { data, error } = await db
    .from("notifications")
    .select(COLUMNS)
    .in("kind", kinds)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw toAppError(error, "Failed to load notices");
  return data.map((row) => toNotice(row as NoticeRow));
}

/**
 * `userId`'s notices, newest first. `before` is the previous page's `nextBefore`
 * (`<created_at>|<id>`). Fetches one extra row only to learn whether another page exists, so an
 * exactly full last page gets no "Show more". RLS already limits rows to the caller.
 */
export async function listNotices(
  db: Client,
  userId: string,
  opts: { before?: string; limit?: number } = {},
): Promise<NoticePage> {
  const { before, limit = PAGE_SIZE } = opts;
  let query = db
    .from("notifications")
    .select(COLUMNS)
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (before) {
    const c = parseCursor(before);
    query = query.or(
      `created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`,
    );
  }
  const { data, error } = await query;
  if (error) throw toAppError(error, "Failed to load notices");
  const rows = data.map((row) => toNotice(row as NoticeRow));
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextBefore: rows.length > limit && last ? encodeCursor(last) : null };
}

export async function fetchUnreadCount(db: Client): Promise<number> {
  const { data, error } = await db.rpc("unread_notification_count");
  if (error) throw toAppError(error, "Failed to load unread count");
  return Number(data ?? 0);
}

/** Marks the given notices read, or every unread notice of the caller without `ids`. Returns how many changed. */
export async function markRead(db: Client, ids?: string[] | null): Promise<number> {
  const { data, error } = await db.rpc("mark_notifications_read", ids ? { p_ids: ids } : {});
  if (error) throw toAppError(error, "Failed to mark as read");
  return Number(data ?? 0);
}

/**
 * A parent's note to their child, through `send_child_note` (it checks the caller is the
 * child's parent, the length and the daily cap). A repeat of the same key sends nothing.
 */
export async function insertChildNote(
  db: Client,
  args: { childId: string; text: string; idempotencyKey: string },
): Promise<NoteResult> {
  const { data, error } = await db.rpc("send_child_note", {
    p_child_id: args.childId,
    p_text: args.text,
    p_idempotency_key: args.idempotencyKey,
  });
  if (error?.code === "JA429") {
    throw new AppError("RATE_LIMITED", "That's a lot of notes today. Send more tomorrow.", {
      cause: error,
    });
  }
  if (error) throw toAppError(error, "Failed to send the note");
  if (data !== "sent" && data !== "already_sent") {
    throw new AppError("INTERNAL", "Something went wrong. Please try again.");
  }
  return data;
}
