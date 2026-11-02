import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types";
import type { Notice, NoticeKind, NoticeSource } from "./types";

type Row = Tables<"notifications">;

export type NoticeChange = { type: "new"; notice: Notice } | { type: "updated" };

/** Raw row to Notice. Realtime rows carry no join, so the child's name is left blank. */
export function rowToNotice(row: Row): Notice {
  const { payload } = row;
  return {
    id: row.id,
    kind: row.kind as NoticeKind,
    childId: row.child_id,
    childName: "",
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

/**
 * Client-side counterpart of the repository: the only browser code that knows the table name.
 * Streams the user's own notice inserts and updates over Supabase Realtime (RLS applies).
 * `onStatus(true)` fires on (re)subscribe so the caller can catch up on anything missed.
 * Returns an unsubscribe function.
 */
export function subscribeToNotices(
  userId: string,
  onChange: (change: NoticeChange) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  const supabase = createClient();
  // A unique topic: `channel()` returns an existing channel of the same name, which would hand a
  // remount (React dev runs effects twice) the one still being removed.
  const channel = supabase
    .channel(`notices:${userId}:${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
      (event: RealtimePostgresChangesPayload<Row>) => {
        if (event.eventType === "INSERT") onChange({ type: "new", notice: rowToNotice(event.new) });
        else onChange({ type: "updated" });
      },
    );
  let stopped = false;
  // The client loads the session token asynchronously; joining before it lands joins as anon,
  // which RLS rejects. Set it first.
  void supabase.realtime.setAuth().then(
    () => {
      if (!stopped) channel.subscribe((status) => onStatus(status === "SUBSCRIBED"));
    },
    () => onStatus(false),
  );
  return () => {
    stopped = true;
    void supabase.removeChannel(channel);
  };
}
