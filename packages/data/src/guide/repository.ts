import {
  actionDraftSchema,
  type GuideEntry,
  type GuideRoute,
  guideCopy,
  proposedGoalArgsSchema,
  type StoredProposal,
} from "@jarso/core/guide";
import { toAppError } from "@jarso/core/lib";
import type { Database, Json } from "@jarso/db";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Client = SupabaseClient<Database>;

/**
 * The guide reads the phone shares. RLS lets a child see every chat about them, a parent's too,
 * so every child-side conversation read here filters `asked_by is null`. Raw reads by id or by
 * parent with no such filter (a chat by id, a parent's own chats, messages by conversation id)
 * are never exported: the parent compositions in `transcript.ts` filter by child or asker in the
 * query and check again in code. Transcript writes, the budget read and rate limits use the
 * admin client and stay in the web server (ADR 0010).
 */

/** A look-up Jarso can make, as stored on a reply. The plain words for each are in guideCopy. */
export type GuideToolName = keyof typeof guideCopy.checked;

function isToolName(name: string): name is GuideToolName {
  return Object.hasOwn(guideCopy.checked, name);
}

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

export const CONVERSATION_COLUMNS =
  "id, child_id, entry, context_key, turns, flagged, created_at, last_message_at, asked_by";

export function toConversation(row: {
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

export const MESSAGE_COLUMNS =
  "id, conversation_id, role, text, route, flagged, rating, created_at, tool_calls";

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
  checked: GuideToolName[];
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
function asChecked(value: Json | null): GuideToolName[] {
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

/** Pure guide_messages row to MessageRow mapping. */
export function toMessage(row: {
  id: string;
  conversation_id: string;
  role: string;
  text: string;
  route: string | null;
  flagged: boolean;
  rating: number | null;
  created_at: string;
  tool_calls: Json | null;
}): MessageRow {
  return {
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
  };
}

export async function rateMessage(db: Client, messageId: string, rating: 1 | -1): Promise<void> {
  const { error } = await db.rpc("rate_guide_message", {
    p_message_id: messageId,
    p_rating: rating,
  });
  if (error) throw toAppError(error, "Failed to save your rating");
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

/** A parent switches Jarso on or off for their child (`set_guide_access` checks the parent). */
export async function saveGuideAccess(
  db: Client,
  childId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await db.rpc("set_guide_access", { p_child_id: childId, p_enabled: enabled });
  if (error) throw toAppError(error, "Failed to change the guide setting");
}

/** The child's own flagged chats with a message since an instant (the parent's badge). */
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
