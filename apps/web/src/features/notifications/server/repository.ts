import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";
import type {
  ClaimedNotice,
  Notice,
  NoticeKind,
  NoticeSource,
  PushSubscriptionInput,
  PushSubscriptionRow,
} from "../types";

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

// --- Web push (FR16) --------------------------------------------------------------------------

/** Stores or refreshes the caller's subscription for this browser; returns its id. */
export async function saveSubscription(
  db: Client,
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<string> {
  const { data, error } = await db.rpc("push_subscribe", {
    p_endpoint: input.endpoint,
    p_p256dh: input.keys.p256dh,
    p_auth: input.keys.auth,
    ...(userAgent ? { p_user_agent: userAgent } : {}),
  });
  if (error) throw toAppError(error, "Failed to save the subscription");
  return String(data);
}

/** Whether the caller owns a subscription for this endpoint (RLS shows only their own rows). */
export async function ownsSubscription(db: Client, endpoint: string): Promise<boolean> {
  const { count, error } = await db
    .from("push_subscriptions")
    .select("id", { head: true, count: "exact" })
    .eq("endpoint", endpoint);
  if (error) throw toAppError(error, "Failed to check the subscription");
  return (count ?? 0) > 0;
}

/** Forgets the caller's subscription for this endpoint. True when one went. */
export async function removeSubscription(db: Client, endpoint: string): Promise<boolean> {
  const { data, error } = await db.rpc("push_unsubscribe", { p_endpoint: endpoint });
  if (error) throw toAppError(error, "Failed to remove the subscription");
  return data === true;
}

type ClaimedRow = {
  id: string;
  recipient_id: string;
  recipient_role: string | null;
  currency: string;
  child_id: string;
  child_name: string | null;
  kind: string;
  source_type: string;
  source_id: string;
  payload: unknown;
  created_at: string;
};

/** Pure claimed-row mapping. A recipient without a membership row counts as a parent. */
export function toClaimed(row: ClaimedRow): ClaimedNotice {
  return {
    recipientId: row.recipient_id,
    role: row.recipient_role === "child" ? "child" : "parent",
    currency: row.currency,
    notice: toNotice({
      ...row,
      read_at: null,
      child: row.child_name === null ? null : { nickname: row.child_name },
    }),
  };
}

/** Admin only: claims up to `limit` unpushed notices from the last day and returns them. */
export async function claimUnpushed(admin: Client, limit: number): Promise<ClaimedNotice[]> {
  const { data, error } = await admin.rpc("claim_unpushed_notifications", { p_limit: limit });
  if (error) throw toAppError(error, "Failed to claim notices");
  return (data ?? []).map((row) => toClaimed(row as ClaimedRow));
}

/** Admin only: the subscriptions of these recipients. */
export async function subscriptionsFor(
  admin: Client,
  recipientIds: string[],
): Promise<PushSubscriptionRow[]> {
  if (recipientIds.length === 0) return [];
  const { data, error } = await admin.rpc("push_subscriptions_for", {
    p_recipient_ids: recipientIds,
  });
  if (error) throw toAppError(error, "Failed to load subscriptions");
  return (data ?? []).map((row) => ({
    id: row.id,
    profileId: row.profile_id,
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
  }));
}

/** Admin only: forgets a subscription whose endpoint is gone (404/410). */
export async function deleteSubscriptionById(admin: Client, id: string): Promise<void> {
  const { error } = await admin.from("push_subscriptions").delete().eq("id", id);
  if (error) throw toAppError(error, "Failed to remove the subscription");
}
