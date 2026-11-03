import type { Notice } from "@jarso/core/notifications";
import { rowToNotice } from "@jarso/data/notifications";
import type { Tables } from "@jarso/db";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { randomUUID } from "expo-crypto";
import { supabase } from "@/lib/supabase/client";

type Row = Tables<"notifications">;

export type NoticeChange = { type: "new"; notice: Notice } | { type: "updated" };

/**
 * The child's own notice inserts and updates over Supabase Realtime (RLS applies): the same
 * channel and filter as the web's `notifications/realtime.ts`. `onStatus(true)` fires on each
 * (re)subscribe so the caller can catch up. Returns an unsubscribe function.
 */
export function subscribeToNotices(
  userId: string,
  onChange: (change: NoticeChange) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  // A unique topic: `channel()` hands back an existing channel of the same name, which would
  // give a resubscribe the one still being removed.
  const channel = supabase
    .channel(`notices:${userId}:${randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
      (event: RealtimePostgresChangesPayload<Row>) => {
        if (event.eventType === "INSERT") onChange({ type: "new", notice: rowToNotice(event.new) });
        else onChange({ type: "updated" });
      },
    );
  let stopped = false;
  // The session is read from storage asynchronously; joining before the token lands joins as
  // anon, which RLS rejects. Set it first.
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
