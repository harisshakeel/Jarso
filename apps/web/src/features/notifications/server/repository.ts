import "server-only";
import type {
  ClaimedNotice,
  NoteResult,
  PushSubscriptionInput,
  PushSubscriptionRow,
} from "@jarso/core/notifications";
import { toNotice } from "@jarso/data/notifications";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database } from "@/types";

type Client = SupabaseClient<Database>;

// Notice reads are shared with the phone; the push and admin functions below stay on the server.
export * from "@jarso/data/notifications";

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

/** `window` is a Postgres interval string, e.g. "10 minutes". Returns true when the hit is allowed. */
export async function hitRateLimit(
  admin: Client,
  key: string,
  window: string,
  max: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("hit_rate_limit", {
    p_key: key,
    p_window: window,
    p_max: max,
  });
  if (error) throw toAppError(error, "Failed to check rate limit");
  return data === true;
}
