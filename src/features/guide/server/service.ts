import "server-only";
import { helplinesFor } from "@/config";
import {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  getFamily,
} from "@/features/family/server";
import { topicTitles } from "@/features/learning";
import { AppError, isAppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { guideCopy } from "../copy";
import type { GuideContextRef } from "../schemas";
import { MAX_TURNS } from "../schemas";
import type { AskGuideResult, ConversationSummary, GuideState, TranscriptMessage } from "../types";
import { guideBreaker } from "./breaker";
import {
  getGuideProvider,
  guideDailyBudgetCents,
  guideMonthlyBudgetCents,
  guideProviderName,
} from "./config";
import { buildContext } from "./context";
import { usageCents, zeroUsage } from "./cost";
import { fallbackResult, type PipelineResult, runGuidePipeline } from "./pipeline";
import { GUIDE_PROMPT_VERSION } from "./prompts";
import type { Turn } from "./provider";
import * as repo from "./repository";

/** Spec §5.2: 5 messages a minute and 30 a day per child. */
const PER_MINUTE = 5;
const PER_DAY = 30;

/** Whether the guide runs at all on this deployment (flag and provider). */
export function isGuideConfigured(): boolean {
  return guideProviderName() !== null;
}

/**
 * For a child's pages: whether to show the guide, and whether the intro card comes first. Fails
 * closed: if the state can't be read, the guide is simply not shown.
 */
export async function getGuideState(childId: string): Promise<GuideState> {
  const off = { available: false, introNeeded: false };
  if (!isGuideConfigured()) return off;
  try {
    const db = await createClient();
    const [enabled, chatted] = await Promise.all([
      repo.findGuideAccess(db, childId),
      repo.hasAnyMessage(db, childId),
    ]);
    return { available: enabled, introNeeded: enabled && !chatted };
  } catch (error) {
    logger.warn("Guide state unavailable", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return off;
  }
}

async function spentCentsSince(since: string): Promise<number> {
  const rows = await repo.usageSince(createAdminClient(), since);
  return rows.reduce((sum, row) => sum + usageCents(row.usage, row.model), 0);
}

/** Whether today's or this month's spend (UTC) has reached its cap. */
async function budgetSpent(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const [day, month] = await Promise.all([
    spentCentsSince(`${today}T00:00:00Z`),
    spentCentsSince(`${today.slice(0, 7)}-01T00:00:00Z`),
  ]);
  return day >= guideDailyBudgetCents() || month >= guideMonthlyBudgetCents();
}

/**
 * Earlier turns for the model: only exchanges that were answered on topic. A message that was
 * routed elsewhere (off topic, personal, safety, unsafe, a jailbreak) is never sent back, so an
 * instruction planted in one turn can't be picked up by a harmless-looking next one.
 */
function onTopicHistory(messages: repo.MessageRow[]): Turn[] {
  const turns: Turn[] = [];
  messages.forEach((message, index) => {
    const reply = messages[index + 1];
    if (message.role === "child" && reply && reply.role === "guide" && reply.route === "on_topic") {
      turns.push({ role: "child", text: message.text }, { role: "guide", text: reply.text });
    }
  });
  return turns;
}

/** One message to the guide from the signed-in child. */
export async function askGuide(input: {
  conversationId: string | null;
  context: GuideContextRef;
  text: string;
}): Promise<AskGuideResult> {
  const { user } = await assertRole("child");
  const provider = getGuideProvider();
  if (!provider) throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  const db = await createClient();
  if (!(await repo.findGuideAccess(db, user.id))) {
    throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  }
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");

  // Context first: an unknown key fails before anything is counted or stored.
  const context = buildContext(input.context, family.currency);

  let history: Turn[] = [];
  let conversationId = input.conversationId;
  let turns = 0;
  if (conversationId) {
    const conversation = await repo.findConversation(db, conversationId);
    if (!conversation || conversation.childId !== user.id) {
      throw new AppError("FORBIDDEN", "You can't do that.");
    }
    if (conversation.turns >= MAX_TURNS) throw new AppError("CONFLICT", guideCopy.chatFull);
    turns = conversation.turns;
    history = onTopicHistory(await repo.listMessages(db, [conversationId]));
  }

  const admin = createAdminClient();
  if (!(await repo.hitRateLimit(admin, `guide:min:${user.id}`, "1 minute", PER_MINUTE))) {
    throw new AppError("RATE_LIMITED", guideCopy.rateLimitedMinute);
  }
  if (!(await repo.hitRateLimit(admin, `guide:day:${user.id}`, "1 day", PER_DAY))) {
    throw new AppError("RATE_LIMITED", guideCopy.rateLimitedDay);
  }

  if (!conversationId) {
    conversationId = await repo.startConversation(admin, {
      childId: user.id,
      entry: context.entry,
      contextKey: context.contextKey,
    });
  }

  let result: PipelineResult;
  const paused = guideBreaker.isOpen() || (provider.name === "anthropic" && (await budgetSpent()));
  if (paused) {
    // No screens run: the keyword net still turns a worrying message into the safety reply.
    result = fallbackResult(input.text, { usage: zeroUsage, model: null, latencyMs: 0 });
  } else {
    result = await runGuidePipeline({ text: input.text, history, context: context.text }, provider);
    if (result.failed) guideBreaker.recordFailure();
    else guideBreaker.recordSuccess();
  }

  let messageId: string;
  try {
    messageId = await repo.recordTurn(admin, {
      conversationId,
      childId: user.id,
      childText: result.childText,
      replyRole: result.role,
      replyText: result.storedText,
      route: result.route,
      flagged: result.flagged,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    // Two messages raced for the last turn of a chat.
    if (isAppError(error) && error.code === "CONFLICT") {
      throw new AppError("CONFLICT", guideCopy.chatFull, { cause: error });
    }
    throw error;
  }

  // Route, model, tokens and latency only: never message text (spec §9).
  logger.info("Guide turn", {
    route: result.route,
    model: result.model,
    prompt: GUIDE_PROMPT_VERSION,
    latencyMs: result.latencyMs,
    mainInput: result.usage.mainInput,
    mainOutput: result.usage.mainOutput,
    cacheRead: result.usage.mainCacheRead,
  });

  return {
    conversationId,
    reply: {
      messageId: result.role === "guide" ? messageId : null,
      role: result.role,
      text: result.text,
      route: result.route,
      topics: result.topics.map((key) => ({ key, title: topicTitles[key] })),
      check: result.check,
      helplines: result.route === "safety" ? helplinesFor(family.currency) : [],
    },
    turnsLeft: Math.max(0, MAX_TURNS - (turns + 1)),
  };
}

export async function rateGuideMessage(messageId: string, rating: 1 | -1): Promise<void> {
  await assertRole("child");
  await repo.rateMessage(await createClient(), messageId, rating);
}

// ---------------------------------------------------------------------------
// Parent
// ---------------------------------------------------------------------------

export async function getGuideAccess(
  childId: string,
): Promise<{ configured: boolean; enabled: boolean }> {
  await assertParentCanRead(childId);
  return {
    configured: isGuideConfigured(),
    enabled: await repo.findGuideAccess(await createClient(), childId),
  };
}

export async function setGuideAccess(childId: string, enabled: boolean): Promise<void> {
  await assertParentOf(childId);
  await repo.setGuideAccess(await createClient(), childId, enabled);
}

const SAFETY_HIDDEN = "A safety response was shown. The message itself is not kept.";
const PERSONAL_HIDDEN = "Personal details were shared, so the message is not kept.";
const EXPIRED = "Older than 30 days, so deleted.";

/**
 * A chat as the parent reads it. A child message that got a safety or personal-details response
 * is stored blank (spec decision 3, ADR 0010); the parent sees a note in its place.
 */
function forParent(messages: repo.MessageRow[]): TranscriptMessage[] {
  return messages.map((message, index) => {
    if (message.role !== "child")
      return { ...message, hidden: false, text: message.text || EXPIRED };
    const reply = messages[index + 1];
    if (reply?.route === "safety") return { ...message, hidden: true, text: SAFETY_HIDDEN };
    if (reply?.route === "personal_info")
      return { ...message, hidden: true, text: PERSONAL_HIDDEN };
    return { ...message, hidden: false, text: message.text || EXPIRED };
  });
}

function summarize(
  conversation: repo.ConversationRow,
  messages: repo.MessageRow[],
): ConversationSummary {
  const first = forParent(messages).find((m) => m.role === "child");
  return {
    id: conversation.id,
    entry: conversation.entry,
    label: labelFor(conversation.entry, conversation.contextKey),
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.lastMessageAt,
    turns: conversation.turns,
    flagged: conversation.flagged,
    preview: first?.text ?? "",
  };
}

/** A child's chats for the parent, flagged first. */
export async function listGuideChats(childId: string): Promise<ConversationSummary[]> {
  await assertParentCanRead(childId);
  const db = await createClient();
  const conversations = await repo.listConversations(db, childId);
  const messages = await repo.listMessages(
    db,
    conversations.map((c) => c.id),
  );
  return conversations.map((conversation) =>
    summarize(
      conversation,
      messages.filter((m) => m.conversationId === conversation.id),
    ),
  );
}

/** One chat, read directly (any age, not only the latest 50). */
export async function getGuideTranscript(
  childId: string,
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: TranscriptMessage[] } | null> {
  await assertParentCanRead(childId);
  const db = await createClient();
  const conversation = await repo.findConversation(db, conversationId);
  if (!conversation || conversation.childId !== childId || conversation.turns === 0) return null;
  const messages = await repo.listMessages(db, [conversationId]);
  return { summary: summarize(conversation, messages), messages: forParent(messages) };
}

/** Flagged chats in the last 30 days, for the badge on the child's card. */
export async function countFlaggedChats(childId: string): Promise<number> {
  await assertParentCanRead(childId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return repo.countFlaggedSince(await createClient(), childId, since);
}

function labelFor(entry: string, contextKey: string): string {
  if (entry === "home") return "Asked from Home";
  if (entry === "topic") {
    const key = contextKey.replace(/^topic:/, "") as keyof typeof topicTitles;
    return topicTitles[key] ? `Topic: ${topicTitles[key]}` : "A topic page";
  }
  const [, source] = contextKey.split(":");
  const where =
    source === "mission" ? "a mission" : source === "practice" ? "practice" : "a topic question";
  return entry === "why" ? `Asked "Why?" in ${where}` : `Help in ${where}`;
}
