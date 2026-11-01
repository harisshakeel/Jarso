import "server-only";
import type { TopicKey } from "@/features/learning";
import { logger } from "@/lib";
import { guideCopy } from "../copy";
import type { GuideCheck, GuideRoute, GuideUsage } from "../types";
import { addUsage, zeroUsage } from "./cost";
import { describeFacts, type Facts, fillFacts } from "./facts";
import {
  type GuideProvider,
  type MainReply,
  type MainResult,
  type Toolbox,
  type Turn,
  type TurnTools,
  usageOf,
} from "./provider";
import { looksUnsafe } from "./safety-net";
import { scrub } from "./scrub";
import type { ToolCall } from "./tool-specs";

/**
 * One guide turn (spec §5.2 steps 3 to 7, ADR 0011): scrub, then the input screen and Jarso's
 * answer in parallel (the answer may look things up), then the figure refs filled from what the
 * tools returned, then the output screen on everything the child would see (the answer and any
 * quick check). Anything but a clean on-topic reply that passes the output screen becomes
 * reviewed fixed copy. Pure apart from the provider and the toolbox, so the evals run exactly
 * this code.
 */

export type PipelineResult = {
  /** The child's message as stored and sent: contact details removed. */
  childText: string;
  route: GuideRoute;
  role: "guide" | "fixed_copy";
  /** The answer the child sees. */
  text: string;
  /** What is stored and screened: the answer plus the quick check, so a parent sees both. */
  storedText: string;
  topics: TopicKey[];
  check: GuideCheck | null;
  /** Shown to the parent first; a safety route also gets a notice. */
  flagged: boolean;
  usage: GuideUsage;
  model: string | null;
  latencyMs: number;
  /** An infrastructure failure (error or timeout), for the circuit breaker. */
  failed: boolean;
  /** What Jarso looked up this turn, kept on the reply so the parent sees it. */
  toolCalls: ToolCall[];
  /** Facts this turn stored, as written; shown to the child under the reply. */
  remembered: string[];
};

const FLAGGED_ROUTES: ReadonlySet<GuideRoute> = new Set([
  "safety",
  "unsafe",
  "jailbreak",
  "blocked_output",
]);
const REDIRECT_TOPICS: TopicKey[] = ["spending", "saving-goal", "tradeoffs"];

/** Longest answer shown (about 80 words is the target; this is the hard stop). */
const MAX_REPLY_CHARS = 900;

type Base = Pick<
  PipelineResult,
  "childText" | "usage" | "model" | "latencyMs" | "toolCalls" | "remembered"
>;

function fixed(route: Exclude<GuideRoute, "on_topic">, base: Base, failed = false): PipelineResult {
  const text = guideCopy.routes[route];
  return {
    ...base,
    route,
    role: "fixed_copy",
    text,
    storedText: text,
    topics: route === "off_topic" ? REDIRECT_TOPICS : [],
    check: null,
    flagged: FLAGGED_ROUTES.has(route),
    failed,
  };
}

/**
 * For when the screens can't run (budget, breaker, outage): the break copy, or the safety reply
 * when the message trips the keyword net.
 */
export function fallbackResult(
  text: string,
  base: Omit<Base, "childText" | "toolCalls" | "remembered">,
  failed = false,
): PipelineResult {
  const childText = scrub(text);
  return fixed(
    looksUnsafe(childText) ? "safety" : "unavailable",
    { ...base, childText, toolCalls: [], remembered: [] },
    failed,
  );
}

/**
 * The reply and its check with every figure ref filled from the tools' facts. Null when a ref
 * was never looked up (or is malformed): the model wrote a figure the app can't vouch for.
 */
function withFacts(reply: MainReply, facts: Facts): MainReply | null {
  const unknown: string[] = [];
  const fill = (text: string) => {
    const filled = fillFacts(text, facts);
    unknown.push(...filled.unknown);
    return filled.text;
  };
  const filled: MainReply = {
    ...reply,
    reply: fill(reply.reply),
    check: reply.check
      ? {
          ...reply.check,
          question: fill(reply.check.question),
          options: reply.check.options.map(fill),
          explanation: fill(reply.check.explanation),
        }
      : null,
  };
  return unknown.length === 0 ? filled : null;
}

/** Keeps a model-proposed check only when it is well formed and short. */
function cleanCheck(check: MainReply["check"]): GuideCheck | null {
  if (!check) return null;
  const question = check.question.trim();
  const explanation = check.explanation.trim();
  const options = check.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 3 || options.some((o) => o.length > 80)) return null;
  if (new Set(options).size !== options.length) return null;
  if (check.answerIndex < 0 || check.answerIndex >= options.length) return null;
  if (!question || question.length > 200 || explanation.length > 240) return null;
  return { question, options, answerIndex: check.answerIndex, explanation };
}

function visibleText(reply: string, check: GuideCheck | null): string {
  if (!check) return reply;
  return `${reply}\n\nQuick check: ${check.question} (${check.options.join(" / ")}) ${check.explanation}`;
}

/** One guide turn, every provider call included, ends here (the pages allow 60 s). */
const TURN_DEADLINE_MS = 45_000;

/** How long a fixed reply waits for a cancelled answer to report the tokens it used. */
const CANCEL_GRACE_MS = 1_000;

type MainOutcome = { ok: true; value: MainResult } | { ok: false; error: unknown };

/** The tokens an answer used, whether it finished, failed or was cancelled. */
function mainUsage(outcome: MainOutcome | null) {
  if (!outcome) return {};
  return outcome.ok ? outcome.value.usage : usageOf(outcome.error);
}

/** A cancelled answer settles almost at once; never hold a fixed reply back for long. */
async function settled(main: Promise<MainOutcome>): Promise<MainOutcome | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CANCEL_GRACE_MS);
  });
  try {
    return await Promise.race([main, late]);
  } finally {
    clearTimeout(timer);
  }
}

export async function runGuidePipeline(
  input: { text: string; history: Turn[]; context: string; tools: TurnTools },
  provider: GuideProvider,
  { deadlineMs = TURN_DEADLINE_MS }: { deadlineMs?: number } = {},
): Promise<PipelineResult> {
  const now = Date.now;
  const started = now();
  const childText = scrub(input.text);
  const history = input.history.map((turn) => ({ ...turn, text: scrub(turn.text) }));
  let usage = zeroUsage;
  let model: string | null = null;
  const base = (): Base => ({
    childText,
    usage,
    model,
    latencyMs: now() - started,
    toolCalls: [...input.tools.calls],
    remembered: [...input.tools.remembered],
  });

  // The answer starts at once (so an on-topic reply isn't slowed by the screen) and is cancelled
  // when the screen routes the message elsewhere, so a safety reply never waits for it.
  // Every provider call shares one signal: the turn deadline, or the cancel below.
  const controller = new AbortController();
  const deadline = AbortSignal.timeout(deadlineMs);
  const signal = AbortSignal.any([deadline, controller.signal]);
  let deadlineLogged = false;
  // Tells a deadline hit from the internal cancel; once per turn, never any message text.
  const noteDeadline = () => {
    if (!deadline.aborted || deadlineLogged) return;
    deadlineLogged = true;
    logger.warn("Guide turn hit its deadline", { deadlineMs });
  };
  // Look-ups wait for the input screen: nothing about the child's money is read, or sent to
  // the model, for a message the screen routes elsewhere.
  let release: (onTopic: boolean) => void = () => {};
  const screened = new Promise<boolean>((resolve) => {
    release = resolve;
  });
  const tools: Toolbox = {
    specs: input.tools.specs,
    run: async (name, args) =>
      (await screened)
        ? input.tools.run(name, args)
        : { content: JSON.stringify({ error: "Not available." }), isError: true },
  };
  const main: Promise<MainOutcome> = provider
    .reply({ text: childText, history, context: input.context, tools, signal })
    .then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );

  let route: Awaited<ReturnType<GuideProvider["screenInput"]>>["route"];
  try {
    const screen = await provider.screenInput({ text: childText, history, signal });
    usage = addUsage(usage, screen.usage);
    route = screen.route;
  } catch (error) {
    release(false);
    controller.abort();
    noteDeadline();
    logger.warn("Guide input screen failed", { error: errorName(error) });
    usage = addUsage(usage, mainUsage(await settled(main)));
    return fallbackResult(input.text, { usage, model, latencyMs: now() - started }, true);
  }

  // Off-topic, personal, safety, unsafe and jailbreak messages never see the model's reply.
  release(route === "on_topic");
  if (route !== "on_topic") {
    controller.abort();
    // A round that finished before the cancel was still paid for.
    usage = addUsage(usage, mainUsage(await settled(main)));
    return fixed(route, base());
  }

  const answer = await main;
  if (!answer.ok) {
    noteDeadline();
    logger.warn("Guide main call failed", { error: errorName(answer.error) });
    usage = addUsage(usage, usageOf(answer.error));
    return fixed("unavailable", base(), true);
  }
  usage = addUsage(usage, answer.value.usage);
  model = answer.value.model;
  if (answer.value.kind === "refused") {
    logger.info("Guide main call refused");
    return fixed("unavailable", base());
  }

  const filled = withFacts(answer.value.reply, input.tools.facts);
  if (!filled) {
    logger.info("Guide reply used a figure that was never looked up");
    return fixed("blocked_output", base());
  }
  const reply = filled.reply.trim();
  if (!reply || reply.length > MAX_REPLY_CHARS) {
    logger.info("Guide reply empty or too long", { chars: reply.length });
    return fixed("blocked_output", base());
  }
  const check = cleanCheck(filled.check);
  const shown = visibleText(reply, check);

  let verdict: Awaited<ReturnType<GuideProvider["screenOutput"]>>;
  try {
    verdict = await provider.screenOutput({
      reply: shown,
      childText,
      context: `${input.context}\n${describeFacts(input.tools.facts)}`,
      signal,
    });
  } catch (error) {
    noteDeadline();
    logger.warn("Guide output screen failed", { error: errorName(error) });
    return fixed("unavailable", base(), true);
  }
  usage = addUsage(usage, verdict.usage);
  if (!verdict.pass) {
    logger.info("Guide reply blocked by the output screen", { problem: verdict.problem });
    return fixed("blocked_output", base());
  }

  return {
    ...base(),
    route: "on_topic",
    role: "guide",
    text: reply,
    storedText: shown,
    topics: [...new Set(filled.topics)].slice(0, 2),
    check,
    flagged: false,
    failed: false,
  };
}

/** Error class names only: messages can echo request content, which must never be logged. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
