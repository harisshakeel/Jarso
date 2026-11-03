import "server-only";
import {
  actionDraftSchema,
  type GuideEntry,
  type GuideRoute,
  type GuideUsage,
  type NoticedInput,
  type NoticedPayload,
  proposedGoalArgsSchema,
  type StoredProposal,
} from "@jarso/core/guide";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError, toAppError } from "@/lib";
import type { Database, Json } from "@/types";
import { isToolName, type ToolCall, type ToolName } from "./tool-specs";

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

export type ConversationRow = {
  id: string;
  childId: string;
  entry: GuideEntry;
  contextKey: string;
  turns: number;
  flagged: boolean;
  createdAt: string;
  lastMessageAt: string;
  /** The parent who asked, for a chat a parent had about the child; null when the child asked. */
  askedBy: string | null;
};

const CONVERSATION_COLUMNS =
  "id, child_id, entry, context_key, turns, flagged, created_at, last_message_at, asked_by";

function toConversation(row: {
  id: string;
  child_id: string;
  entry: string;
  context_key: string;
  turns: number;
  flagged: boolean;
  created_at: string;
  last_message_at: string;
  asked_by?: string | null;
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
    askedBy: row.asked_by ?? null,
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

/** A child's own chats (not a parent's about them), flagged first then newest, at most `limit`. */
export async function listConversations(
  db: Client,
  childId: string,
  limit = 50,
): Promise<ConversationRow[]> {
  const { data, error } = await db
    .from("guide_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("child_id", childId)
    .is("asked_by", null)
    .gt("turns", 0)
    .order("flagged", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error) throw toAppError(error, "Failed to load chats");
  return data.map(toConversation);
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

export type MessageRow = {
  id: string;
  conversationId: string;
  role: "child" | "guide" | "fixed_copy";
  text: string;
  route: GuideRoute | null;
  flagged: boolean;
  rating: -1 | 1 | null;
  createdAt: string;
  /** What Jarso looked up for this reply, in order (replies only). */
  checked: ToolName[];
  /** What Jarso offered with this reply: a goal's arguments or an action's checked draft. */
  proposed?: StoredProposal | null;
};

/**
 * The last offer on a reply (`propose_goal` arguments or a `propose_action` draft), while it is
 * still stored (the retention job keeps only tool names after 30 days) and well formed.
 */
function asProposed(value: Json | null): StoredProposal | null {
  if (!Array.isArray(value)) return null;
  for (let i = value.length - 1; i >= 0; i--) {
    const call = value[i];
    if (!call || typeof call !== "object" || Array.isArray(call)) continue;
    if (call.name === "propose_goal") {
      const parsed = proposedGoalArgsSchema.safeParse(call.input);
      return parsed.success ? { type: "goal", args: parsed.data } : null;
    }
    if (call.name === "propose_action") {
      const input = call.input;
      const draft =
        input && typeof input === "object" && !Array.isArray(input) ? input.draft : undefined;
      const parsed = actionDraftSchema.safeParse(draft);
      // A call that made no card (fields were missing) is skipped, so an earlier card still shows.
      if (parsed.success) return { type: "action", draft: parsed.data };
    }
  }
  return null;
}

/** Tool names from a stored `tool_calls` array; anything unrecognised is dropped. */
function asChecked(value: Json | null): ToolName[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((call) =>
    call && typeof call === "object" && !Array.isArray(call) && typeof call.name === "string"
      ? isToolName(call.name)
        ? [call.name]
        : []
      : [],
  );
}

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
    .select("id, conversation_id, role, text, route, flagged, rating, created_at, tool_calls")
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
    checked: asChecked(row.tool_calls),
    proposed: asProposed(row.tool_calls),
  }));
}

/** Whether the child has ever sent the guide a message (the intro card shows until then). */
export async function hasAnyMessage(db: Client, childId: string): Promise<boolean> {
  const { data, error } = await db
    .from("guide_messages")
    .select("id")
    .eq("child_id", childId)
    .eq("role", "child")
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
