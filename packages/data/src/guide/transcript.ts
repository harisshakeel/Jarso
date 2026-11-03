import type { ConversationSummary, TranscriptMessage } from "@jarso/core/guide";
import { guideCopy } from "@jarso/core/guide";
import { topicTitles } from "@jarso/core/learning";
import { toAppError } from "@jarso/core/lib";
import { listMessages } from "./messages";
import {
  type Client,
  CONVERSATION_COLUMNS,
  type ConversationRow,
  type GuideToolName,
  listConversations,
  type MessageRow,
  toConversation,
} from "./repository";

// How a chat reads to its asker (the child, or a parent reading their own chat) and to a parent.

/** What Jarso looked at, in plain words, each once. */
export function lookedAt(names: readonly GuideToolName[]): string[] {
  return [...new Set(names.map((name) => guideCopy.checked[name]))];
}

const SAFETY_HIDDEN = "A safety response was shown. The message itself is not kept.";
const PERSONAL_HIDDEN = "Personal details were shared, so the message is not kept.";
const EXPIRED = "Older than 30 days, so deleted.";
/** What the asker sees in place of their own message that was not kept. */
const NOT_KEPT = "This message wasn't kept.";

/**
 * A chat as a reader sees it. A child message that got a safety or personal-details response
 * is stored blank (spec decision 3, ADR 0010); the parent sees a note in its place, and the
 * asker (the child, or a parent reading their own chat) a plain line.
 */
export function transcriptFor(
  messages: MessageRow[],
  viewer: "parent" | "asker",
): TranscriptMessage[] {
  return messages.map(({ checked, ...message }, index) => {
    if (message.role !== "child") {
      const text = message.text || EXPIRED;
      return { ...message, hidden: false, text, lookedAt: lookedAt(checked) };
    }
    const shown = { ...message, lookedAt: [] };
    const reply = messages[index + 1];
    if (reply?.route === "safety") {
      return { ...shown, hidden: true, text: viewer === "parent" ? SAFETY_HIDDEN : NOT_KEPT };
    }
    if (reply?.route === "personal_info") {
      return { ...shown, hidden: true, text: viewer === "parent" ? PERSONAL_HIDDEN : NOT_KEPT };
    }
    return { ...shown, hidden: false, text: message.text || EXPIRED };
  });
}

/** A chat as the parent reads it. */
export function forParent(messages: MessageRow[]): TranscriptMessage[] {
  return transcriptFor(messages, "parent");
}

export function summarize(
  conversation: ConversationRow,
  messages: MessageRow[],
  viewer: "parent" | "asker" = "parent",
): ConversationSummary {
  const first = transcriptFor(messages, viewer).find((m) => m.role === "child");
  return {
    id: conversation.id,
    childId: conversation.childId,
    entry: conversation.entry,
    label: labelFor(conversation.entry, conversation.contextKey),
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt,
    turns: conversation.turns,
    flagged: conversation.flagged,
    preview: first?.text ?? "",
  };
}

/** The child's own chats (not a parent's about them), newest first (the Jarso page). */
export async function listMyChats(db: Client, childId: string): Promise<ConversationSummary[]> {
  const conversations = await listConversations(db, childId);
  const messages = await listMessages(
    db,
    conversations.map((c) => c.id),
  );
  return conversations
    .map((conversation) =>
      summarize(
        conversation,
        messages.filter((m) => m.conversationId === conversation.id),
        "asker",
      ),
    )
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** One of the child's own chats, to pick it up again. Null when it isn't theirs or a parent asked. */
export async function getMyTranscript(
  db: Client,
  childId: string,
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: TranscriptMessage[] } | null> {
  const { data, error } = await db
    .from("guide_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .eq("child_id", childId)
    .is("asked_by", null)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the chat");
  if (!data) return null;
  const conversation = toConversation(data);
  // Checked again in code: a parent's chat about the child is never the child's to reopen.
  if (conversation.childId !== childId || conversation.askedBy !== null) return null;
  const messages = await listMessages(db, [conversationId]);
  return {
    summary: summarize(conversation, messages, "asker"),
    messages: transcriptFor(messages, "asker"),
  };
}

type Transcript = { summary: ConversationSummary; messages: TranscriptMessage[] };

/** Each chat with its own messages, summarised for the viewer, in the chats' order. */
async function summarizeAll(
  db: Client,
  conversations: ConversationRow[],
  viewer: "parent" | "asker",
): Promise<ConversationSummary[]> {
  const messages = await listMessages(
    db,
    conversations.map((c) => c.id),
  );
  return conversations.map((conversation) =>
    summarize(
      conversation,
      messages.filter((m) => m.conversationId === conversation.id),
      viewer,
    ),
  );
}

/** A child's own chats as their parent sees them, flagged first, then newest. */
export async function listChildChats(db: Client, childId: string): Promise<ConversationSummary[]> {
  return summarizeAll(db, await listConversations(db, childId), "parent");
}

/**
 * One chat about the child, as their parent reads it (any age, not only the latest 50). Null
 * when it is about another child or has no turns. The caller checks the reader is a parent.
 */
export async function getChildTranscript(
  db: Client,
  childId: string,
  conversationId: string,
): Promise<Transcript | null> {
  const { data, error } = await db
    .from("guide_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .eq("child_id", childId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the chat");
  if (!data) return null;
  const conversation = toConversation(data);
  if (conversation.childId !== childId || conversation.turns === 0) return null;
  const messages = await listMessages(db, [conversationId]);
  return { summary: summarize(conversation, messages), messages: forParent(messages) };
}

/** Chats a parent asked about any of their children, newest first, at most 50. */
export async function listChatsAskedBy(db: Client, userId: string): Promise<ConversationSummary[]> {
  const { data, error } = await db
    .from("guide_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("asked_by", userId)
    .gt("turns", 0)
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (error) throw toAppError(error, "Failed to load chats");
  return summarizeAll(db, data.map(toConversation), "asker");
}

/** One of a parent's own chats about a child. Null when someone else asked it. */
export async function getAskerTranscript(
  db: Client,
  userId: string,
  conversationId: string,
): Promise<Transcript | null> {
  const { data, error } = await db
    .from("guide_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .eq("asked_by", userId)
    .maybeSingle();
  if (error) throw toAppError(error, "Failed to load the chat");
  if (!data) return null;
  const conversation = toConversation(data);
  // Checked again in code: only the asker reopens their own chat.
  if (conversation.askedBy !== userId) return null;
  const messages = await listMessages(db, [conversationId]);
  return {
    summary: summarize(conversation, messages, "asker"),
    messages: transcriptFor(messages, "asker"),
  };
}

/** The chat's title: where it was asked from. */
export function labelFor(entry: string, contextKey: string): string {
  if (entry === "home") return "Asked from Home";
  if (entry === "parent") return "A parent asked about them";
  if (entry === "topic") {
    const key = contextKey.replace(/^topic:/, "") as keyof typeof topicTitles;
    return topicTitles[key] ? `Topic: ${topicTitles[key]}` : "A topic page";
  }
  const [, source] = contextKey.split(":");
  const where =
    source === "mission" ? "a mission" : source === "practice" ? "practice" : "a topic question";
  return entry === "why" ? `Asked "Why?" in ${where}` : `Help in ${where}`;
}
