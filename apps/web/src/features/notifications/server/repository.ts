import "server-only";
import type {
  ClaimedNotice,
  DeviceTokenRow,
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
  overnight: boolean | null;
};

/** Pure claimed-row mapping. A recipient without a membership row counts as a parent. */
export function toClaimed(row: ClaimedRow): ClaimedNotice {
  return {
    recipientId: row.recipient_id,
    role: row.recipient_role === "child" ? "child" : "parent",
    currency: row.currency,
    overnight: row.overnight === true,
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

/** Admin only: the phone push tokens of these recipients. */
export async function deviceTokensFor(
  admin: Client,
  recipientIds: string[],
): Promise<DeviceTokenRow[]> {
  if (recipientIds.length === 0) return [];
  const { data, error } = await admin.rpc("device_push_tokens_for", {
    p_recipient_ids: recipientIds,
  });
  if (error) throw toAppError(error, "Failed to load device tokens");
  return (data ?? []).map((row) => ({ id: row.id, profileId: row.profile_id, token: row.token }));
}

/** Admin only: forgets a token Expo reports as `DeviceNotRegistered`. */
export async function deleteDeviceTokenById(admin: Client, id: string): Promise<void> {
  const { error } = await admin.from("device_push_tokens").delete().eq("id", id);
  if (error) throw toAppError(error, "Failed to remove the device token");
}

/** Admin only: Expo ticket ids to check for a receipt on a later sweep. */
export async function recordExpoTickets(
  admin: Client,
  rows: { id: string; tokenId: string }[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await admin.from("device_push_tickets").upsert(
    rows.map((row) => ({ id: row.id, token_id: row.tokenId })),
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw toAppError(error, "Failed to record push tickets");
}

/** Receipts are ready some minutes after a send; older tickets are due for a check. */
const RECEIPT_DELAY_MS = 15 * 60 * 1000;

/** Admin only: the oldest tickets sent at least 15 minutes ago. */
export async function takeDueExpoTickets(
  admin: Client,
  limit = 1000,
): Promise<{ id: string; tokenId: string }[]> {
  const cutoff = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();
  const { data, error } = await admin
    .from("device_push_tickets")
    .select("id, token_id")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw toAppError(error, "Failed to load push tickets");
  return (data ?? []).map((row) => ({ id: row.id, tokenId: row.token_id }));
}

/** Ids per delete request, so the filter stays well inside URL limits. */
const DELETE_CHUNK = 200;

/** Admin only: forgets checked tickets. */
export async function deleteExpoTickets(admin: Client, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
    const { error } = await admin
      .from("device_push_tickets")
      .delete()
      .in("id", ids.slice(i, i + DELETE_CHUNK));
    if (error) throw toAppError(error, "Failed to remove push tickets");
  }
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
