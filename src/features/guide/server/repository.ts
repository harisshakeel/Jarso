import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, toAppError } from "@/lib";
import type { Database, Json } from "@/types";
import type { GuideEntry, GuideRoute, GuideUsage } from "../types";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows the guide tables and functions. Reads use the caller's client (RLS:
 * the child or their parents). Transcript writes and the budget read use the admin client and
 * service_role-only functions, called by the service after its own checks (ADR 0010).
 */

const ROUTES: readonly GuideRoute[] = [
  "on_topic",
  "off_topic",
  "personal_info",
  "safety",
  "unsafe",
  "jailbreak",
  "blocked_output",
  "unavailable",
];

function asRoute(value: string | null): GuideRoute | null {
  return value && (ROUTES as readonly string[]).includes(value) ? (value as GuideRoute) : null;
}

function asEntry(value: string): GuideEntry {
  return value === "why" || value === "topic" || value === "home" ? value : "step";
}

export async function findGuideAccess(db: Client, childId: string): Promise<boolean> {
  const { data, error } = await db
    .from("guide_access")
    .select("enabled")
    .eq("child_id", childId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the guide setting");
  return data?.enabled === true;
}

export async function setGuideAccess(db: Client, childId: string, enabled: boolean): Promise<void> {
  const { error } = await db.rpc("set_guide_access", { p_child_id: childId, p_enabled: enabled });
  if (error) throw toAppError(error, "Failed to change the guide setting");
}

export type ConversationRow = {
  id: string;
  childId: string;
  entry: GuideEntry;
  contextKey: string;
  turns: number;
  flagged: boolean;
  createdAt: string;
  lastMessageAt: string;
};

const CONVERSATION_COLUMNS =
  "id, child_id, entry, context_key, turns, flagged, created_at, last_message_at";

function toConversation(row: {
  id: string;
  child_id: string;
  entry: string;
  context_key: string;
  turns: number;
  flagged: boolean;
  created_at: string;
  last_message_at: string;
}): ConversationRow {
  return {
    id: row.id,
    childId: row.child_id,
    entry: asEntry(row.entry),
    contextKey: row.context_key,
    turns: row.turns,
    flagged: row.flagged,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  };
}

export async function findConversation(
  db: Client,
  conversationId: string,
): Promise<ConversationRow | null> {
  const { data, error } = await db
    .from("guide_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the chat");
  return data ? toConversation(data) : null;
}

/** A child's chats, flagged first then newest, at most `limit`. */
export async function listConversations(
  db: Client,
  childId: string,
  limit = 50,
): Promise<ConversationRow[]> {
  const { data, error } = await db
    .from("guide_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("child_id", childId)
    .gt("turns", 0)
    .order("flagged", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error) throw toAppError(error, "Failed to load chats");
  return data.map(toConversation);
}

export type MessageRow = {
  id: string;
  conversationId: string;
  role: "child" | "guide" | "fixed_copy";
  text: string;
  route: GuideRoute | null;
  flagged: boolean;
  rating: -1 | 1 | null;
  createdAt: string;
};

function asRole(value: string): MessageRow["role"] {
  return value === "guide" || value === "fixed_copy" ? value : "child";
}

export async function listMessages(
  db: Client,
  conversationIds: readonly string[],
): Promise<MessageRow[]> {
  if (conversationIds.length === 0) return [];
  const { data, error } = await db
    .from("guide_messages")
    .select("id, conversation_id, role, text, route, flagged, rating, created_at")
    .in("conversation_id", [...conversationIds])
    .order("created_at", { ascending: true })
    .order("role", { ascending: true });
  if (error) throw toAppError(error, "Failed to load the chat");
  return data.map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: asRole(row.role),
    text: row.text,
    route: asRoute(row.route),
    flagged: row.flagged,
    rating: row.rating === 1 || row.rating === -1 ? row.rating : null,
    createdAt: row.created_at,
  }));
}

/** Whether the child has ever sent the guide a message (the intro card shows until then). */
export async function hasAnyMessage(db: Client, childId: string): Promise<boolean> {
  const { count, error } = await db
    .from("guide_messages")
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId)
    .eq("role", "child");
  if (error) throw toAppError(error, "Failed to load the guide");
  return (count ?? 0) > 0;
}

export async function rateMessage(db: Client, messageId: string, rating: 1 | -1): Promise<void> {
  const { error } = await db.rpc("rate_guide_message", {
    p_message_id: messageId,
    p_rating: rating,
  });
  if (error) throw toAppError(error, "Failed to save your rating");
}

// ---------------------------------------------------------------------------
// Admin client only (service_role functions)
// ---------------------------------------------------------------------------

export async function startConversation(
  admin: Client,
  input: { childId: string; entry: GuideEntry; contextKey: string },
): Promise<string> {
  const { data, error } = await admin.rpc("guide_start_conversation", {
    p_child_id: input.childId,
    p_entry: input.entry,
    p_context_key: input.contextKey,
  });
  if (error) throw toAppError(error, "Failed to start the chat");
  if (!data) throw new AppError("INTERNAL", "Failed to start the chat");
  return data;
}

export async function recordTurn(
  admin: Client,
  input: {
    conversationId: string;
    childId: string;
    childText: string;
    replyRole: "guide" | "fixed_copy";
    replyText: string;
    route: GuideRoute;
    flagged: boolean;
    model: string | null;
    usage: GuideUsage;
    latencyMs: number;
  },
): Promise<string> {
  const { data, error } = await admin.rpc("guide_record_turn", {
    p_conversation_id: input.conversationId,
    p_child_id: input.childId,
    p_child_text: input.childText,
    p_reply_role: input.replyRole,
    p_reply_text: input.replyText,
    p_route: input.route,
    p_flagged: input.flagged,
    p_model: input.model ?? "",
    p_usage: {
      main_input: input.usage.mainInput,
      main_output: input.usage.mainOutput,
      main_cache_read: input.usage.mainCacheRead,
      main_cache_write: input.usage.mainCacheWrite,
      screen_input: input.usage.screenInput,
      screen_output: input.usage.screenOutput,
    } as Json,
    p_latency_ms: input.latencyMs,
  });
  if (error) throw toAppError(error, "Failed to save the chat");
  if (!data) throw new AppError("INTERNAL", "Failed to save the chat");
  return data;
}

/** Token totals since an instant, per main model, for the daily budget. */
export async function usageSince(
  admin: Client,
  sinceIso: string,
): Promise<{ model: string; usage: GuideUsage }[]> {
  const { data, error } = await admin.rpc("guide_usage_since", { p_since: sinceIso });
  if (error) throw toAppError(error, "Failed to check the guide budget");
  return (data ?? []).map((row) => ({
    model: row.model ?? "",
    usage: {
      mainInput: Number(row.main_input ?? 0),
      mainOutput: Number(row.main_output ?? 0),
      mainCacheRead: Number(row.main_cache_read ?? 0),
      mainCacheWrite: Number(row.main_cache_write ?? 0),
      screenInput: Number(row.screen_input ?? 0),
      screenOutput: Number(row.screen_output ?? 0),
    },
  }));
}

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
