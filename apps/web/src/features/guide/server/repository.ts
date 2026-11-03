import "server-only";
import type {
  GuideEntry,
  GuideRoute,
  GuideUsage,
  NoticedInput,
  NoticedPayload,
} from "@jarso/core/guide";
import {
  CONVERSATION_COLUMNS,
  type ConversationRow,
  MESSAGE_COLUMNS,
  type MessageRow,
  toConversation,
  toMessage,
} from "@jarso/data/guide";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError, toAppError } from "@/lib";
import type { Database, Json } from "@/types";
import type { ToolCall } from "./tool-specs";

type Client = SupabaseClient<Database>;

/**
 * Only place that knows the guide tables and functions. Reads use the caller's client (RLS:
 * the child or their parents); the chat reads are shared with the phone (`@jarso/data/guide`).
 * Transcript writes and the budget read use the admin client and service_role-only functions,
 * called by the service after its own checks (ADR 0010).
 */
export * from "@jarso/data/guide";

// Reads by id or by parent, with no `asked_by is null` filter: parent-side flows only, after the
// service's own checks. Never shared with the phone, where a child could reach a parent's chat.

/** One chat by id, whoever asked. The service checks it is the reader's to see. */
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

/** A parent's own chats about any of their children, newest first, at most `limit`. */
export async function listConversationsAskedBy(
  db: Client,
  parentId: string,
  limit = 50,
): Promise<ConversationRow[]> {
  const { data, error } = await db
    .from("guide_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("asked_by", parentId)
    .gt("turns", 0)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error) throw toAppError(error, "Failed to load chats");
  return data.map(toConversation);
}

/** Messages of the given chats. Ids alone don't say whose chat it is: look the chat up first. */
export async function listMessages(
  db: Client,
  conversationIds: readonly string[],
): Promise<MessageRow[]> {
  if (conversationIds.length === 0) return [];
  const { data, error } = await db
    .from("guide_messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", [...conversationIds])
    .order("created_at", { ascending: true })
    .order("role", { ascending: true });
  if (error) throw toAppError(error, "Failed to load the chat");
  return data.map(toMessage);
}

/**
 * Whether Jarso is on for the child: on by default, off only when a parent turned it off. (The
 * row's consent_version records which explanation the parent had; it gates nothing.)
 */
export async function findGuideAccess(db: Client, childId: string): Promise<boolean> {
  const { data, error } = await db
    .from("guide_access")
    .select("enabled")
    .eq("child_id", childId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the guide setting");
  return data ? data.enabled : true;
}

export async function setGuideAccess(db: Client, childId: string, enabled: boolean): Promise<void> {
  const { error } = await db.rpc("set_guide_access", { p_child_id: childId, p_enabled: enabled });
  if (error) throw toAppError(error, "Failed to change the guide setting");
}

/**
 * Whether the child has ever sent the guide a message (the intro card shows until then). A chat
 * a parent had about the child doesn't count.
 */
export async function hasAnyMessage(db: Client, childId: string): Promise<boolean> {
  const { data, error } = await db
    .from("guide_messages")
    .select("id, guide_conversations!inner(asked_by)")
    .eq("child_id", childId)
    .eq("role", "child")
    .is("guide_conversations.asked_by", null)
    .limit(1);
  if (error) throw toAppError(error, "Failed to load the guide");
  return data.length > 0;
}

/** Flagged chats with a message since an instant (the parent's badge). */
export async function countFlaggedSince(
  db: Client,
  childId: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await db
    .from("guide_conversations")
    .select("id", { count: "exact", head: true })
    .eq("child_id", childId)
    .is("asked_by", null)
    .eq("flagged", true)
    .gte("last_message_at", sinceIso);
  if (error) throw toAppError(error, "Failed to load chats");
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Admin client only (service_role functions)
// ---------------------------------------------------------------------------

export async function startConversation(
  admin: Client,
  input: { childId: string; entry: GuideEntry; contextKey: string; askedBy?: string | null },
): Promise<string> {
  const { data, error } = await admin.rpc("guide_start_conversation", {
    p_child_id: input.childId,
    p_entry: input.entry,
    p_context_key: input.contextKey,
    ...(input.askedBy ? { p_asked_by: input.askedBy } : {}),
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
    clientMessageId: string;
    toolCalls: ToolCall[];
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
    p_client_message_id: input.clientMessageId,
    p_tool_calls: input.toolCalls as unknown as Json,
  });
  if (error) throw toAppError(error, "Failed to save the chat");
  if (!data) throw new AppError("INTERNAL", "Failed to save the chat");
  return data;
}

/** The chat and reply already stored for a child's client message id, if any. */
export async function findTurn(
  admin: Client,
  childId: string,
  clientMessageId: string,
): Promise<{ conversationId: string; replyId: string } | null> {
  const { data, error } = await admin.rpc("guide_find_turn", {
    p_child_id: childId,
    p_client_message_id: clientMessageId,
  });
  if (error) throw toAppError(error, "Failed to load the chat");
  const row = data?.[0];
  return row ? { conversationId: row.conversation_id, replyId: row.reply_id } : null;
}

/** Token totals since an instant, per main model, for the daily and monthly budgets. */
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

// ---------------------------------------------------------------------------
// Jarso noticed (demo 3): admin client only, from the weekly job
// ---------------------------------------------------------------------------

/** One child, as the weekly job sees them. */
export type NoticedRow = {
  childId: string;
  nickname: string;
  currency: string;
  guideOn: boolean;
  lastNoticedAt: string | null;
  input: NoticedInput;
};

const allowanceDaysSchema = z.array(z.object({ on: z.string(), saved: z.boolean() })).catch([]);
const goalSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    target_minor: z.number(),
    counted_minor: z.number(),
  })
  .nullable()
  .catch(null);

/** Every approved child with what the week's signals need (`guide_noticed_inputs`). */
export async function listNoticedInputs(admin: Client, nowIso: string): Promise<NoticedRow[]> {
  const { data, error } = await admin.rpc("guide_noticed_inputs", { p_now: nowIso });
  if (error) throw toAppError(error, "Failed to load what Jarso noticed");
  return (data ?? []).map((row) => {
    const goal = goalSchema.parse(row.goal ?? null);
    return {
      childId: row.child_id,
      nickname: row.nickname ?? "",
      currency: row.currency,
      guideOn: row.guide_on,
      lastNoticedAt: row.last_noticed_at ?? null,
      input: {
        today: row.today,
        allowances: allowanceDaysSchema.parse(row.allowance_days),
        goal: goal && {
          id: goal.id,
          name: goal.name,
          targetMinor: goal.target_minor,
          countedMinor: goal.counted_minor,
        },
        spentLast7DaysMinor: Number(row.spent_last_7_days_minor ?? 0),
        spent7DaysBeforeMinor: Number(row.spent_7_days_before_minor ?? 0),
        lastMoveOn: row.last_move_on ?? null,
        sentKeys: row.signal_keys ?? [],
      },
    };
  });
}

/**
 * Records one nudge and writes its notices (`guide_noticed_record`): to the child when `child`
 * is given, to every parent when `parent` is. Returns the notices written; 0 when the child had
 * a nudge in the last 6 days or this signal was sent before.
 */
export async function recordNoticed(
  admin: Client,
  input: {
    childId: string;
    signalKey: string;
    child: NoticedPayload | null;
    parent: NoticedPayload | null;
  },
): Promise<number> {
  const { data, error } = await admin.rpc("guide_noticed_record", {
    p_child_id: input.childId,
    p_signal_key: input.signalKey,
    p_child_payload: input.child as unknown as Json,
    p_parent_payload: input.parent as unknown as Json,
  });
  if (error) throw toAppError(error, "Failed to record what Jarso noticed");
  return Number(data ?? 0);
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
