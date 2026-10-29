import "server-only";
import type { TopicKey } from "@/features/learning";
import { logger } from "@/lib";
import { guideCopy } from "../copy";
import type { GuideCheck, GuideRoute, GuideUsage } from "../types";
import { addUsage, zeroUsage } from "./cost";
import type { GuideProvider, MainReply, Turn } from "./provider";
import { scrub } from "./scrub";

/**
 * One guide turn (spec §5.2 steps 3 to 7): scrub, then the input screen and the main call in
 * parallel, then the output screen on the reply. Anything but a clean on-topic reply that passes
 * the output screen becomes reviewed fixed copy. Pure apart from the provider, so the evals run
 * exactly this code.
 */

export type PipelineResult = {
  /** The child's message as stored and sent: contact details removed. */
  childText: string;
  route: GuideRoute;
  role: "guide" | "fixed_copy";
  text: string;
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

function fixed(
  route: Exclude<GuideRoute, "on_topic">,
  base: Pick<PipelineResult, "childText" | "usage" | "model" | "latencyMs">,
  failed = false,
): PipelineResult {
  return {
    ...base,
    route,
    role: "fixed_copy",
    text: guideCopy.routes[route],
    topics: route === "off_topic" ? REDIRECT_TOPICS : [],
    check: null,
    flagged: FLAGGED_ROUTES.has(route),
    failed,
  };
}

/** Keeps a model-proposed check only when it is well formed. */
function cleanCheck(check: MainReply["check"]): GuideCheck | null {
  if (!check) return null;
  const options = check.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2 || options.length > 3) return null;
  if (check.answerIndex < 0 || check.answerIndex >= options.length) return null;
  if (!check.question.trim() || check.question.length > 240) return null;
  return {
    question: check.question.trim(),
    options,
    answerIndex: check.answerIndex,
    explanation: check.explanation.trim(),
  };
}

export async function runGuidePipeline(
  input: { text: string; history: Turn[]; context: string },
  provider: GuideProvider,
  now: () => number = Date.now,
): Promise<PipelineResult> {
  const started = now();
  const childText = scrub(input.text);
  const history = input.history.map((turn) => ({ ...turn, text: scrub(turn.text) }));
  let usage = zeroUsage;
  let model: string | null = null;
  const base = () => ({ childText, usage, model, latencyMs: now() - started });

  const [screen, main] = await Promise.allSettled([
    provider.screenInput({ text: childText, history }),
    provider.reply({ text: childText, history, context: input.context }),
  ]);

  if (main.status === "fulfilled") {
    usage = addUsage(usage, main.value.usage);
    model = main.value.model;
  }
  if (screen.status === "rejected") {
    logger.warn("Guide input screen failed", { error: errorName(screen.reason) });
    return fixed("unavailable", base(), true);
  }
  usage = addUsage(usage, screen.value.usage);

  // Off-topic, personal, safety, unsafe and jailbreak messages never see the model's reply.
  if (screen.value.route !== "on_topic") return fixed(screen.value.route, base());

  if (main.status === "rejected") {
    logger.warn("Guide main call failed", { error: errorName(main.reason) });
    return fixed("unavailable", base(), true);
  }
  if (main.value.kind === "refused") {
    logger.info("Guide main call refused");
    return fixed("unavailable", base());
  }

  const reply = main.value.reply;
  let verdict: Awaited<ReturnType<GuideProvider["screenOutput"]>>;
  try {
    verdict = await provider.screenOutput({
      reply: reply.reply,
      childText,
      context: input.context,
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
    text: reply.reply.trim(),
    topics: [...new Set(reply.topics)].slice(0, 2),
    check: cleanCheck(reply.check),
    flagged: false,
    failed: false,
  };
}

/** Error class names only: messages can echo request content, which must never be logged. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
