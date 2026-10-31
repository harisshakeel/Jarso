import "server-only";
import { helplinesFor } from "@/config";
import { assertUser } from "@/features/auth/server";
import {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  assertSelfOrParentOf,
  getFamily,
} from "@/features/family/server";
import { topicTitles } from "@/features/learning";
import { AppError, familyToday, isAppError, logger } from "@/lib";
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
import { type BuiltContext, buildContext } from "./context";
import { usageCents, zeroUsage } from "./cost";
import { deleteMemory, listMemories } from "./memory";
import { fallbackResult, type PipelineResult, runGuidePipeline } from "./pipeline";
import { GUIDE_PROMPT_VERSION } from "./prompts";
import type { GuideProvider, Turn } from "./provider";
import * as repo from "./repository";
import type { ToolName } from "./tool-specs";
import { createTurnTools } from "./tools";

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

type Client = ReturnType<typeof createAdminClient>;

/**
 * The answer already stored for this question, for a re-send after a lost reply. It is read
 * back as stored: a quick check is part of the reply text, and topic links are not kept.
 */
async function storedTurn(
  admin: Client,
  childId: string,
  clientMessageId: string,
): Promise<AskGuideResult | null> {
  const turn = await repo.findTurn(admin, childId, clientMessageId);
  if (!turn) return null;
  const messages = await repo.listMessages(await createClient(), [turn.conversationId]);
  const reply = messages.find((message) => message.id === turn.replyId);
  if (!reply || reply.role === "child" || !reply.route) {
    throw new AppError("INTERNAL", "Failed to load the chat");
  }
  const family = reply.route === "safety" ? await getFamily() : null;
  const turns = messages.filter((message) => message.role === "child").length;
  return {
    conversationId: turn.conversationId,
    reply: {
      messageId: reply.role === "guide" ? reply.id : null,
      role: reply.role,
      text: reply.text,
      route: reply.route,
      topics: [],
      check: null,
      helplines: family ? helplinesFor(family.currency) : [],
      lookedAt: lookedAt(reply.checked),
      remembered: [],
    },
    turnsLeft: Math.max(0, MAX_TURNS - turns),
  };
}

/** What Jarso looked at, in plain words, each once. */
function lookedAt(names: readonly ToolName[]): string[] {
  return [...new Set(names.map((name) => guideCopy.checked[name]))];
}

/** A message checked and ready for Jarso, or one already answered (a re-send). */
export type PreparedTurn =
  | { kind: "stored"; result: AskGuideResult }
  | {
      kind: "ready";
      childId: string;
      family: { currency: string; timezone: string };
      provider: GuideProvider;
      context: BuiltContext;
      conversationId: string;
      turns: number;
      history: Turn[];
      text: string;
      clientMessageId: string;
    };

/**
 * Everything before Jarso runs: the child, the switch, a re-send, the context, the chat, the
 * rate limits. Throws an AppError for anything that stops the turn, before any of it streams. A
 * question already answered (same `clientMessageId`) gets its stored reply once Jarso is
 * confirmed on, before anything is counted or sent to the model.
 */
export async function prepareGuideTurn(input: {
  clientMessageId: string;
  conversationId: string | null;
  context: GuideContextRef;
  text: string;
}): Promise<PreparedTurn> {
  const { user } = await assertRole("child");
  const provider = getGuideProvider();
  if (!provider) throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  const db = await createClient();
  if (!(await repo.findGuideAccess(db, user.id))) {
    throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  }
  // After the switch (a child-safety boundary), before anything is counted or sent.
  const admin = createAdminClient();
  const replay = await storedTurn(admin, user.id, input.clientMessageId);
  if (replay) return { kind: "stored", result: replay };
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");

  // Context first: an unknown key fails before anything is counted or stored.
  const context = buildContext(input.context, family.currency, familyToday(family.timezone));
  // What Jarso remembers rides in the per-turn context as data, never as instructions. It is
  // optional context: if it can't be read, the turn goes ahead without it.
  const memories = await listMemories(db, user.id).catch((error: unknown) => {
    logger.warn("Guide memories unavailable", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return [];
  });
  if (memories.length > 0) {
    context.text = [
      context.text,
      "What you remember about this child from earlier chats (facts they told you; use lightly):",
      ...memories.map((m) => `- ${guideCopy.memories.kinds[m.kind]}: ${m.text}`),
    ].join("\n");
  }

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

  return {
    kind: "ready",
    childId: user.id,
    family: { currency: family.currency, timezone: family.timezone },
    provider,
    context,
    conversationId,
    turns,
    history,
    text: input.text,
    clientMessageId: input.clientMessageId,
  };
}

/**
 * Runs a prepared turn: Jarso answers (looking things up as the signed-in child, with a status
 * line for each look-up through `onStatus`), then the turn is stored and the reply returned.
 */
export async function runGuideTurn(
  turn: Extract<PreparedTurn, { kind: "ready" }>,
  { onStatus }: { onStatus?: (text: string) => void } = {},
): Promise<AskGuideResult> {
  const { provider, family, conversationId, clientMessageId } = turn;
  const admin = createAdminClient();

  let result: PipelineResult;
  const paused = guideBreaker.isOpen() || (provider.name === "anthropic" && (await budgetSpent()));
  if (paused) {
    // No screens run: the keyword net still turns a worrying message into the safety reply.
    result = fallbackResult(turn.text, { usage: zeroUsage, model: null, latencyMs: 0 });
  } else {
    // The child's id comes from the session, never from the model (ADR 0011).
    const tools = createTurnTools(
      { childId: turn.childId, currency: family.currency, timezone: family.timezone },
      onStatus,
    );
    result = await runGuidePipeline(
      { text: turn.text, history: turn.history, context: turn.context.text, tools },
      provider,
    );
    if (result.failed) guideBreaker.recordFailure();
    else guideBreaker.recordSuccess();
  }

  let messageId: string;
  try {
    messageId = await repo.recordTurn(admin, {
      conversationId,
      childId: turn.childId,
      childText: result.childText,
      replyRole: result.role,
      replyText: result.storedText,
      route: result.route,
      flagged: result.flagged,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
      clientMessageId,
      toolCalls: result.toolCalls,
    });
  } catch (error) {
    // The same question raced in and was stored first: answer with that turn.
    const raced = await storedTurn(admin, turn.childId, clientMessageId).catch(() => null);
    if (raced) return raced;
    // Two messages raced for the last turn of a chat.
    if (isAppError(error) && error.code === "CONFLICT") {
      throw new AppError("CONFLICT", guideCopy.chatFull, { cause: error });
    }
    throw error;
  }

  // Route, model, tokens, latency and look-up names only: never message text (spec §9).
  logger.info("Guide turn", {
    route: result.route,
    model: result.model,
    prompt: GUIDE_PROMPT_VERSION,
    latencyMs: result.latencyMs,
    mainInput: result.usage.mainInput,
    mainOutput: result.usage.mainOutput,
    cacheRead: result.usage.mainCacheRead,
    lookups: result.toolCalls.map((call) => call.name),
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
      lookedAt: lookedAt(result.toolCalls.map((call) => call.name)),
      remembered: result.remembered,
    },
    turnsLeft: Math.max(0, MAX_TURNS - (turn.turns + 1)),
  };
}

/** One message to Jarso, without status lines (the step and topic sheets). */
export async function askGuide(input: {
  clientMessageId: string;
  conversationId: string | null;
  context: GuideContextRef;
  text: string;
}): Promise<AskGuideResult> {
  const turn = await prepareGuideTurn(input);
  return turn.kind === "stored" ? turn.result : runGuideTurn(turn);
}

/** What Jarso remembers about a child. The child, or a parent of the child. */
export async function getMemories(childId: string) {
  await assertSelfOrParentOf(childId);
  return listMemories(await createClient(), childId);
}

/** Forgets one memory. RLS keeps it to the child's own or their parents'. */
export async function forgetMemory(memoryId: string): Promise<void> {
  await assertUser();
  await deleteMemory(await createClient(), memoryId);
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
  return messages.map(({ checked, ...message }, index) => {
    if (message.role !== "child") {
      const text = message.text || EXPIRED;
      return { ...message, hidden: false, text, lookedAt: lookedAt(checked) };
    }
    const shown = { ...message, lookedAt: [] };
    const reply = messages[index + 1];
    if (reply?.route === "safety") return { ...shown, hidden: true, text: SAFETY_HIDDEN };
    if (reply?.route === "personal_info") return { ...shown, hidden: true, text: PERSONAL_HIDDEN };
    return { ...shown, hidden: false, text: message.text || EXPIRED };
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
