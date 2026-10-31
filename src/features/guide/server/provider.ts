import "server-only";
import { z } from "zod";
import { topicKeys } from "@/features/learning";
import type { GuideUsage, ScreenRoute } from "../types";
import type { Facts } from "./facts";
import type { ToolCall } from "./tool-specs";

/** One earlier turn, as plain text (no thinking blocks are replayed). */
export type Turn = { role: "child" | "guide"; text: string };

/** A tool as the model sees it: a name, what it is for, and a strict JSON schema. */
export type ToolSpec = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
};

/**
 * Jarso's read-only look-ups for one turn (ADR 0011). `run` never throws: an unknown tool, bad
 * arguments or a failed read come back as an error result the model can recover from.
 */
export interface Toolbox {
  readonly specs: readonly ToolSpec[];
  run(name: string, input: unknown): Promise<{ content: string; isError: boolean }>;
}

/** A turn's toolbox as the pipeline holds it: it reads back what was looked up. */
export type TurnTools = Toolbox & { facts: Facts; calls: ToolCall[] };

export const mainReplySchema = z.object({
  reply: z.string(),
  topics: z.array(z.enum(topicKeys)),
  check: z
    .object({
      question: z.string(),
      options: z.array(z.string()),
      answerIndex: z.number().int(),
      explanation: z.string(),
    })
    .nullable(),
});
export type MainReply = z.infer<typeof mainReplySchema>;

export const inputScreenSchema = z.object({
  route: z.enum(["on_topic", "off_topic", "personal_info", "safety", "unsafe", "jailbreak"]),
  reason: z.string(),
});

export const outputScreenSchema = z.object({
  pass: z.boolean(),
  problem: z.enum([
    "none",
    "product_or_purchase",
    "personal_info",
    "unsafe",
    "claims_human",
    "comments_on_money",
    "invented_figure",
    "off_topic",
    "reveals_answer_early",
  ]),
  reason: z.string(),
});

export type MainResult =
  | { kind: "ok"; reply: MainReply; usage: Partial<GuideUsage>; model: string }
  | { kind: "refused"; usage: Partial<GuideUsage>; model: string };

/** How many rounds of look-ups one answer may take before it must reply. */
export const MAX_TOOL_ROUNDS = 3;

/**
 * Carries the tokens a reply had already used on the error that ended it (a deadline, a cancel,
 * an HTTP failure), so the daily and monthly budgets still count rounds that were paid for.
 */
export function withUsage(error: unknown, usage: Partial<GuideUsage>): unknown {
  if (error !== null && typeof error === "object") {
    Object.defineProperty(error, "guideUsage", { value: usage, configurable: true });
  }
  return error;
}

/** The tokens `withUsage` put on an error, or none. */
export function usageOf(error: unknown): Partial<GuideUsage> {
  if (error === null || typeof error !== "object" || !("guideUsage" in error)) return {};
  return error.guideUsage as Partial<GuideUsage>;
}

/**
 * What the pipeline needs from a model provider. The Anthropic provider calls Claude; the fake
 * one answers by keyword for e2e runs and tests, and is refused on production.
 *
 * Contract: a refused or unreadable response is a result (input screen: "safety"; main reply:
 * "refused"; output screen: not passed), never a throw. A throw means an infrastructure failure
 * (network, timeout, HTTP error) and feeds the circuit breaker.
 */
export interface GuideProvider {
  readonly name: "anthropic" | "fake";
  screenInput(args: {
    text: string;
    history: Turn[];
    signal?: AbortSignal;
  }): Promise<{ route: ScreenRoute; usage: Partial<GuideUsage> }>;
  /** Answers, looking things up with `tools` for at most MAX_TOOL_ROUNDS rounds. */
  reply(args: {
    text: string;
    history: Turn[];
    context: string;
    tools: Toolbox;
    signal?: AbortSignal;
  }): Promise<MainResult>;
  /** `reply` is everything the child would see: the answer plus any quick check. */
  screenOutput(args: {
    reply: string;
    childText: string;
    context: string;
    signal?: AbortSignal;
  }): Promise<{ pass: boolean; problem: string; usage: Partial<GuideUsage> }>;
}
