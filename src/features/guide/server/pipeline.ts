import "server-only";
import type { TopicKey } from "@/features/learning";
import { logger } from "@/lib";
import { guideCopy } from "../copy";
import type { GuideCheck, GuideRoute, GuideUsage } from "../types";
import { addUsage, zeroUsage } from "./cost";
import type { GuideProvider, MainReply, MainResult, Turn } from "./provider";
import { looksUnsafe } from "./safety-net";
import { scrub } from "./scrub";

/**
 * One guide turn (spec §5.2 steps 3 to 7): scrub, then the input screen and the main call in
 * parallel, then the output screen on everything the child would see (the answer and any quick
 * check). Anything but a clean on-topic reply that passes the output screen becomes reviewed
 * fixed copy. Pure apart from the provider, so the evals run exactly this code.
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

type Base = Pick<PipelineResult, "childText" | "usage" | "model" | "latencyMs">;

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
  base: Omit<Base, "childText">,
  failed = false,
): PipelineResult {
  const childText = scrub(text);
  return fixed(looksUnsafe(childText) ? "safety" : "unavailable", { ...base, childText }, failed);
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

export async function runGuidePipeline(
  input: { text: string; history: Turn[]; context: string },
  provider: GuideProvider,
  { deadlineMs = TURN_DEADLINE_MS }: { deadlineMs?: number } = {},
): Promise<PipelineResult> {
  const now = Date.now;
  const started = now();
  const childText = scrub(input.text);
  const history = input.history.map((turn) => ({ ...turn, text: scrub(turn.text) }));
  let usage = zeroUsage;
  let model: string | null = null;
  const base = (): Base => ({ childText, usage, model, latencyMs: now() - started });

  // The answer starts at once (so an on-topic reply isn't slowed by the screen) and is cancelled
  // when the screen routes the message elsewhere, so a safety reply never waits for it.
  // Every provider call shares one signal: the turn deadline, or the cancel below.
  const controller = new AbortController();
  const signal = AbortSignal.any([AbortSignal.timeout(deadlineMs), controller.signal]);
  const main: Promise<{ ok: true; value: MainResult } | { ok: false; error: unknown }> = provider
    .reply({ text: childText, history, context: input.context, signal })
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
    controller.abort();
    logger.warn("Guide input screen failed", { error: errorName(error) });
    return fallbackResult(input.text, { usage, model, latencyMs: now() - started }, true);
  }

  // Off-topic, personal, safety, unsafe and jailbreak messages never see the model's reply.
  if (route !== "on_topic") {
    controller.abort();
    return fixed(route, base());
  }

  const answer = await main;
  if (!answer.ok) {
    logger.warn("Guide main call failed", { error: errorName(answer.error) });
    return fixed("unavailable", base(), true);
  }
  usage = addUsage(usage, answer.value.usage);
  model = answer.value.model;
  if (answer.value.kind === "refused") {
    logger.info("Guide main call refused");
    return fixed("unavailable", base());
  }

  const reply = answer.value.reply.reply.trim();
  if (!reply || reply.length > MAX_REPLY_CHARS) {
    logger.info("Guide reply empty or too long", { chars: reply.length });
    return fixed("blocked_output", base());
  }
  const check = cleanCheck(answer.value.reply.check);
  const shown = visibleText(reply, check);

  let verdict: Awaited<ReturnType<GuideProvider["screenOutput"]>>;
  try {
    verdict = await provider.screenOutput({
      reply: shown,
      childText,
      context: input.context,
      signal,
    });
  } catch (error) {
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
    topics: [...new Set(answer.value.reply.topics)].slice(0, 2),
    check,
    flagged: false,
    failed: false,
  };
}

/** Error class names only: messages can echo request content, which must never be logged. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
