import "server-only";
import { checkSummary, type SummaryFacts } from "@jarso/core/dashboard";
import type {
  AcceptGoalProposal,
  AcceptGoalProposalResult,
  AskGuideResult,
  ConversationSummary,
  GuideContextRef,
  GuideState,
  PhotoPriceResult,
  TranscriptMessage,
} from "@jarso/core/guide";
import {
  guideCopy,
  isOtherCurrency,
  MAX_TURNS,
  makeGoalProposal,
  priceQuestion,
  proposalFromStored,
  readPrice,
  splitDataUrl,
  tidyPhotoLabel,
} from "@jarso/core/guide";
import {
  getAskerTranscript,
  getChildTranscript,
  listChatsAskedBy,
  listChildChats,
  listMyChats as loadMyChats,
  getMyTranscript as loadMyTranscript,
  lookedAt,
} from "@jarso/data/guide";
import { cacheLife } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { helplinesFor } from "@/config";
import { getSchedule } from "@/features/allowance/server";
import { assertUser } from "@/features/auth/server";
import {
  assertParentCanRead,
  assertParentOf,
  assertRole,
  assertSelfOrParentOf,
  getFamily,
  listChildren,
} from "@/features/family/server";
import { archiveGoal, getGoalView, saveGoal } from "@/features/goals/server";
import { topicTitles } from "@/features/learning";
import { AppError, familyToday, formatMoney, isAppError, logger } from "@/lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { guideBreaker, summaryBreaker } from "./breaker";
import { budgetSpent } from "./budget";
import { getGuideProvider, getPriceReader, getSummaryWriter, guideProviderName } from "./config";
import { type BuiltContext, buildContext } from "./context";
import { zeroUsage } from "./cost";
import { deleteMemory, listMemories } from "./memory";
import { fallbackResult, type PipelineResult, runGuidePipeline } from "./pipeline";
import { GUIDE_PROMPT_VERSION } from "./prompts";
import type { GuideProvider, Turn } from "./provider";
import * as repo from "./repository";
import { cleanLabel, createTurnTools, savingPlan } from "./tools";

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
  // A goal card comes back only with a reply that was shown.
  const offered = reply.role === "guide" && reply.route === "on_topic" ? reply.proposed : null;
  const family = reply.route === "safety" || offered ? await getFamily() : null;
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
      helplines: family && reply.route === "safety" ? helplinesFor(family.currency) : [],
      lookedAt: lookedAt(reply.checked),
      remembered: [],
      proposal: family && offered ? proposalFromStored(offered, family.currency) : null,
    },
    turnsLeft: Math.max(0, MAX_TURNS - turns),
  };
}

/**
 * Who is asking, and about whom: the signed-in child about themselves, or a parent about one of
 * their own children (the parent's Home). Anything else is refused before a read.
 */
async function resolveAsker(
  context: GuideContextRef,
): Promise<{ userId: string; childId: string; nickname: string | null; parent: boolean }> {
  if (context.entry !== "parent") {
    const { user } = await assertRole("child");
    return { userId: user.id, childId: user.id, nickname: null, parent: false };
  }
  const { user } = await assertRole("parent");
  const child = (await listChildren()).find((c) => c.id === context.childId);
  if (!child) throw new AppError("FORBIDDEN", "You can't do that.");
  return { userId: user.id, childId: child.id, nickname: child.nickname, parent: true };
}

/** A message checked and ready for Jarso, or one already answered (a re-send). */
export type PreparedTurn =
  | { kind: "stored"; result: AskGuideResult }
  | {
      kind: "ready";
      childId: string;
      /** The parent asking about the child, or null when the child asks. */
      askedBy: string | null;
      /** The child's nickname when a parent asks, for the parent's action cards. */
      childName?: string | null;
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
  const asker = await resolveAsker(input.context);
  const { childId } = asker;
  const askedBy = asker.parent ? asker.userId : null;
  const provider = getGuideProvider();
  if (!provider) throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  const db = await createClient();
  if (!(await repo.findGuideAccess(db, childId))) {
    throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  }
  // After the switch (a child-safety boundary), before anything is counted or sent.
  const admin = createAdminClient();
  const replay = await storedTurn(admin, childId, input.clientMessageId);
  if (replay) return { kind: "stored", result: replay };
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");

  // Context first: an unknown key fails before anything is counted or stored.
  const context = buildContext(input.context, family.currency, familyToday(family.timezone), {
    childNickname: asker.nickname ?? undefined,
  });
  // What Jarso remembers rides in the per-turn context as data, never as instructions. It is
  // optional context: if it can't be read, the turn goes ahead without it. A parent's chat about
  // the child never sees the child's memories.
  const memories = asker.parent
    ? []
    : await listMemories(db, childId).catch((error: unknown) => {
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
    if (!conversation || conversation.childId !== childId || conversation.askedBy !== askedBy) {
      throw new AppError("FORBIDDEN", "You can't do that.");
    }
    if (conversation.turns >= MAX_TURNS) throw new AppError("CONFLICT", guideCopy.chatFull);
    turns = conversation.turns;
    history = onTopicHistory(await repo.listMessages(db, [conversationId]));
  }

  if (!(await repo.hitRateLimit(admin, `guide:min:${asker.userId}`, "1 minute", PER_MINUTE))) {
    throw new AppError("RATE_LIMITED", guideCopy.rateLimitedMinute);
  }
  if (!(await repo.hitRateLimit(admin, `guide:day:${asker.userId}`, "1 day", PER_DAY))) {
    throw new AppError("RATE_LIMITED", guideCopy.rateLimitedDay);
  }

  if (!conversationId) {
    conversationId = await repo.startConversation(admin, {
      childId,
      entry: context.entry,
      contextKey: context.contextKey,
      askedBy,
    });
  }

  return {
    kind: "ready",
    childId,
    askedBy,
    ...(asker.parent ? { childName: asker.nickname } : {}),
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
      {
        childId: turn.childId,
        currency: family.currency,
        timezone: family.timezone,
        forParent: turn.askedBy !== null,
        ...(turn.childName ? { childName: turn.childName } : {}),
      },
      onStatus,
    );
    result = await runGuidePipeline(
      {
        text: turn.text,
        history: turn.history,
        context: turn.context.text,
        tools,
        asker: turn.askedBy !== null ? "parent" : "child",
      },
      provider,
      { onStatus },
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
    blocked: result.blocked,
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
      proposal: result.proposal,
    },
    turnsLeft: Math.max(0, MAX_TURNS - (turn.turns + 1)),
  };
}

// ---------------------------------------------------------------------------
// Goal by chat and the photo price check (demo 3): Jarso offers, the child decides
// ---------------------------------------------------------------------------

/**
 * The plan a goal can keep: at most the allowance (a schedule that isn't stopped), or the price
 * without one, the same rules `save_goal` enforces. Null when there is none or it doesn't fit.
 */
async function planThatFits(
  childId: string,
  priceMinor: number,
  planMinor: number | null,
): Promise<number | null> {
  if (!planMinor) return null;
  const schedule = await getSchedule(childId);
  const cap = schedule && schedule.status !== "stopped" ? schedule.amountMinor : priceMinor;
  return planMinor <= cap ? planMinor : null;
}

/**
 * The child tapped "Make it my goal" on a card Jarso offered. Saved through the goals service,
 * as the child (RLS and `save_goal` apply). A child who already has a different goal is asked
 * first; on "Swap it" the old goal is archived, as the goal sheet's "start a new goal" does, so
 * the new goal starts fresh instead of taking over the old one's progress dates.
 */
export async function acceptGoalProposal(
  input: AcceptGoalProposal,
): Promise<AcceptGoalProposalResult> {
  const { user } = await assertRole("child");
  const current = await getGoalView(user.id);
  const sameGoal =
    !!current && current.goal.name.trim().toLowerCase() === input.title.trim().toLowerCase();
  if (current && !sameGoal && !input.replace) {
    return { status: "has_goal", existing: current.goal.name };
  }
  // Checked before anything changes, so a plan save_goal would refuse never costs the old goal.
  const planMinor = await planThatFits(user.id, input.priceMinor, input.saveEachMinor);
  if (current && !sameGoal) await archiveGoal(current.goal.id);
  const goalId = await saveGoal({
    name: input.title,
    emoji: input.emoji,
    targetMinor: input.priceMinor,
    planMinor,
  });
  logger.info("Guide goal accepted", { replaced: !!current && !sameGoal });
  return { status: "saved", goalId, planKept: planMinor === input.saveEachMinor };
}

/** The photo read's own deadline, inside the action's. */
const PHOTO_DEADLINE_MS = 20_000;

/** "headphones" → "Headphones", for a goal's name. */
function asGoalName(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The photo price check: reads the main price on a photo, then works out the child's plan in
 * code and hands back a question for Jarso and a goal the child can make. Same switches, rate
 * limits, budget and breaker as a chat turn, and a photo counts as one of the child's messages.
 * The image goes to Claude once and is never stored or logged.
 */
export async function readPriceFromPhoto(image: string): Promise<PhotoPriceResult> {
  const { user } = await assertRole("child");
  const reader = getPriceReader();
  if (!reader) throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  const db = await createClient();
  if (!(await repo.findGuideAccess(db, user.id))) {
    throw new AppError("FORBIDDEN", guideCopy.switchedOff);
  }
  const family = await getFamily();
  if (!family) throw new AppError("FORBIDDEN", "You can't do that.");
  const admin = createAdminClient();
  if (!(await repo.hitRateLimit(admin, `guide:min:${user.id}`, "1 minute", PER_MINUTE))) {
    throw new AppError("RATE_LIMITED", guideCopy.rateLimitedMinute);
  }
  if (!(await repo.hitRateLimit(admin, `guide:day:${user.id}`, "1 day", PER_DAY))) {
    throw new AppError("RATE_LIMITED", guideCopy.rateLimitedDay);
  }
  if (guideBreaker.isOpen() || (reader.name === "anthropic" && (await budgetSpent()))) {
    throw new AppError("UNAVAILABLE", guideCopy.routes.unavailable);
  }

  const { mediaType, data } = splitDataUrl(image);
  let reading: unknown;
  try {
    const result = await reader.read({
      mediaType,
      data,
      signal: AbortSignal.timeout(PHOTO_DEADLINE_MS),
    });
    guideBreaker.recordSuccess();
    reading = result.reading;
    // Tokens only: never the photo, the price or the label.
    logger.info("Guide photo read", {
      reader: reader.name,
      read: reading !== null,
      screenInput: result.usage.screenInput ?? 0,
      screenOutput: result.usage.screenOutput ?? 0,
    });
  } catch (error) {
    guideBreaker.recordFailure();
    logger.warn("Guide photo read failed", {
      error: error instanceof Error ? error.name : typeof error,
    });
    throw new AppError("UNAVAILABLE", guideCopy.routes.unavailable, { cause: error });
  }

  const read = readPrice(reading, family.currency);
  if (!read.found) return { found: false, reason: "no_price" };
  if (isOtherCurrency(read.currency, family.currency)) {
    return { found: false, reason: "other_currency" };
  }
  // The label skips the input screen until the child sends the question, so it gets the same
  // clean-up as any label a person typed.
  const tidy = tidyPhotoLabel(read.label);
  const cleaned = tidy ? cleanLabel(tidy) : null;
  const label = cleaned && cleaned !== "(label not shown)" ? cleaned : null;
  // With a goal plan already set, "about how many allowances" uses it; otherwise the child says.
  const current = await getGoalView(user.id).catch(() => null);
  const eachMinor = current?.goal.planMinor ?? null;
  const plan = await savingPlan(user.id, read.priceMinor, eachMinor);
  const proposal = makeGoalProposal(
    {
      title: label ? asGoalName(label) : guideCopy.photo.untitled,
      priceMinor: read.priceMinor,
      saveEachMinor: eachMinor,
      allowances: plan.allowances,
    },
    family.currency,
  );
  return {
    found: true,
    priceMinor: read.priceMinor,
    price: formatMoney(read.priceMinor, family.currency, { showMinor: "nonzero" }),
    label,
    text: priceQuestion(read.priceMinor, label, family.currency),
    allowances: plan.allowances,
    proposal,
  };
}

/** Summaries one parent may ask for in an hour; every dashboard view and filter is one. */
const SUMMARIES_PER_HOUR = 30;
const SUMMARY_DEADLINE_MS = 8_000;

/**
 * The family summary at the top of the parent's dashboard (spec answer 5): a sentence or two by
 * Claude Haiku from the dashboard's own facts, checked before it is shown. Null whenever it
 * can't be written (the guide off, the breaker open, the budget spent, too many in an hour, a
 * failed call or a failed check): the dashboard reads fine without it, so this never throws.
 * The same parent and facts can be answered from this server's memory for a few hours; on
 * serverless that memory often doesn't outlive the instance, so the hourly limit is the real cap.
 * Its tokens are logged, not yet added to the guide's budget totals.
 */
export async function writeFamilySummary(facts: SummaryFacts): Promise<string | null> {
  const writer = getSummaryWriter();
  if (!writer || facts.lines.length === 0) return null;
  try {
    // Inside the try: a parent whose profile is incomplete is refused here, and must still get
    // the page (with its profile dialog), just without a summary.
    const { user } = await assertRole("parent");
    if (summaryBreaker.isOpen() || (writer.name === "anthropic" && (await budgetSpent()))) {
      return null;
    }
    const text = await cachedFamilySummary(facts, user.id);
    summaryBreaker.recordSuccess();
    return text !== null && checkSummary(text, facts) ? text : null;
  } catch (error) {
    unstable_rethrow(error);
    if (!isAppError(error)) summaryBreaker.recordFailure();
    logger.warn("Family summary failed", {
      error: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

/**
 * One summary per parent and set of facts (the cache key is both arguments). Only a cache miss
 * reaches the rate limit and Claude, so reloading the same page never uses the hour up. Over the
 * limit it throws, and a throw is never cached. Tokens only in the log.
 */
async function cachedFamilySummary(facts: SummaryFacts, parentId: string): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  const writer = getSummaryWriter();
  if (!writer) return null;
  const admin = createAdminClient();
  if (!(await repo.hitRateLimit(admin, `summary:hour:${parentId}`, "1 hour", SUMMARIES_PER_HOUR))) {
    throw new AppError("RATE_LIMITED", "Too many summaries this hour.");
  }
  const result = await writer.write({ facts, signal: AbortSignal.timeout(SUMMARY_DEADLINE_MS) });
  logger.info("Family summary written", {
    writer: writer.name,
    written: result.text !== null,
    screenInput: result.usage.screenInput ?? 0,
    screenOutput: result.usage.screenOutput ?? 0,
  });
  return result.text;
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
  await repo.saveGuideAccess(await createClient(), childId, enabled);
}

/** A child's chats for the parent, flagged first. */
export async function listGuideChats(childId: string): Promise<ConversationSummary[]> {
  await assertParentCanRead(childId);
  return listChildChats(await createClient(), childId);
}

/** One chat, read directly (any age, not only the latest 50). */
export async function getGuideTranscript(
  childId: string,
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: TranscriptMessage[] } | null> {
  await assertParentCanRead(childId);
  return getChildTranscript(await createClient(), childId, conversationId);
}

/** The signed-in child's own chats (not a parent's about them), newest first (the Jarso page). */
export async function listMyChats(): Promise<ConversationSummary[]> {
  const { user } = await assertRole("child");
  return loadMyChats(await createClient(), user.id);
}

/** One of the signed-in child's own chats, to pick it up again. Null when it isn't theirs. */
export async function getMyTranscript(
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: TranscriptMessage[] } | null> {
  const { user } = await assertRole("child");
  return loadMyTranscript(await createClient(), user.id, conversationId);
}

/** The signed-in parent's own chats about their children, newest first (the Jarso page). */
export async function listParentChats(): Promise<ConversationSummary[]> {
  const { user } = await assertRole("parent");
  return listChatsAskedBy(await createClient(), user.id);
}

/** One of the signed-in parent's own chats about a child. Null when it isn't theirs. */
export async function getParentTranscript(
  conversationId: string,
): Promise<{ summary: ConversationSummary; messages: TranscriptMessage[] } | null> {
  const { user } = await assertRole("parent");
  return getAskerTranscript(await createClient(), user.id, conversationId);
}

/** Flagged chats in the last 30 days, for the badge on the child's card. */
export async function countFlaggedChats(childId: string): Promise<number> {
  await assertParentCanRead(childId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  return repo.countFlaggedSince(await createClient(), childId, since);
}
