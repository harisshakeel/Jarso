import "server-only";
import { helplinesFor } from "@/config";
import {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  getFamily,
} from "@/features/family/server";
import { topicTitles } from "@/features/learning";
import { AppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { guideCopy } from "../copy";
import type { GuideContextRef } from "../schemas";
import { MAX_TURNS } from "../schemas";
import type { AskGuideResult, ConversationSummary, GuideState, TranscriptMessage } from "../types";
import { guideBreaker } from "./breaker";
import { getGuideProvider, guideDailyBudgetCents, guideProviderName } from "./config";
import { buildContext } from "./context";
import { usageCents, zeroUsage } from "./cost";
import { type PipelineResult, runGuidePipeline } from "./pipeline";
import type { Turn } from "./provider";
import * as repo from "./repository";
import { scrub } from "./scrub";

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

async function spentTodayCents(): Promise<number> {
  const since = `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;
  const rows = await repo.usageSince(createAdminClient(), since);
  return rows.reduce((sum, row) => sum + usageCents(row.usage, row.model), 0);
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
  if (!(await repo.findGuideAccess(db, user.id)))
    throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");

  // Context first: an unknown key fails before anything is counted or stored.
  const context = buildContext(input.context, family.currency);

  let history: Turn[] = [];
  let conversationId = input.conversationId;
  let turns = 0;
  if (conversationId) {
    const conversation = await repo.findConversation(db, conversationId);
    if (!conversation || conversation.childId !== user.id)
      throw new AppError("FORBIDDEN", "You can't do that.");
    if (conversation.turns >= MAX_TURNS) throw new AppError("CONFLICT", guideCopy.chatFull);
    turns = conversation.turns;
    history = (await repo.listMessages(db, [conversationId])).map((m) => ({
      role: m.role === "child" ? "child" : "guide",
      text: m.text,
    }));
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
  const paused =
    guideBreaker.isOpen() ||
    (provider.name === "anthropic" && (await spentTodayCents()) >= guideDailyBudgetCents());
  if (paused) {
    result = {
      // Still scrubbed before it is stored.
      childText: scrub(input.text),
      route: "unavailable",
      role: "fixed_copy",
      text: guideCopy.routes.unavailable,
      topics: [],
      check: null,
      flagged: false,
      usage: zeroUsage,
      model: null,
      latencyMs: 0,
      failed: false,
    };
  } else {
    result = await runGuidePipeline({ text: input.text, history, context: context.text }, provider);
    if (result.failed) guideBreaker.recordFailure();
    else guideBreaker.recordSuccess();
  }

  const messageId = await repo.recordTurn(admin, {
    conversationId,
    childId: user.id,
    childText: result.childText,
    replyRole: result.role,
    replyText: result.text,
    route: result.route,
    flagged: result.flagged,
    model: result.model,
    usage: result.usage,
    latencyMs: result.latencyMs,
  });

  // Route, model, tokens and latency only: never message text (spec §9).
  logger.info("Guide turn", {
    route: result.route,
    model: result.model,
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

const SAFETY_HIDDEN = "A safety response was shown. The message is private.";

/**
 * A child's chats for the parent: flagged first. A child message that got a safety response is
 * not shown to the parent (spec decision 3): only that a safety response was shown.
 */
export async function listGuideChats(childId: string): Promise<ConversationSummary[]> {
  await assertParentCanRead(childId);
  const db = await createClient();
  const conversations = await repo.listConversations(db, childId);
  const messages = await repo.listMessages(
    db,
    conversations.map((c) => c.id),
  );
  return conversations.map((conversation) => {
    const own = messages.filter((m) => m.conversationId === conversation.id);
    const transcript = hideSafety(own);
    const first = transcript.find((m) => m.role === "child");
    return {
      id: conversation.id,
      entry: conversation.entry,
      label: labelFor(conversation.entry, conversation.contextKey),
      createdAt: conversation.createdAt,
      lastMessageAt: conversation.lastMessageAt,
      turns: conversation.turns,
      flagged: conversation.flagged,
      preview: first
        ? first.hidden
          ? SAFETY_HIDDEN
          : first.text || "Older than 30 days, so deleted."
        : "",
    };
  });
}

export async function getGuideTranscript(
  childId: string,
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: TranscriptMessage[] } | null> {
  const chats = await listGuideChats(childId);
  const summary = chats.find((c) => c.id === conversationId);
  if (!summary) return null;
  const messages = await repo.listMessages(await createClient(), [conversationId]);
  return { summary, messages: hideSafety(messages) };
}

/** Number of flagged chats in the last 30 days, for the badge on the child's card. */
export async function countFlaggedChats(childId: string): Promise<number> {
  const chats = await listGuideChats(childId);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return chats.filter((c) => c.flagged && Date.parse(c.lastMessageAt) >= cutoff).length;
}

function hideSafety(messages: repo.MessageRow[]): TranscriptMessage[] {
  return messages.map((message, index) => {
    const reply = messages[index + 1];
    const hidden = message.role === "child" && reply?.route === "safety";
    return { ...message, text: hidden ? SAFETY_HIDDEN : message.text, hidden };
  });
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
