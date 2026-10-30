import "server-only";
import { z } from "zod";
import { topicKeys } from "@/features/learning";
import type { GuideUsage, ScreenRoute } from "../types";

/** One earlier turn, as plain text (no thinking blocks are replayed). */
export type Turn = { role: "child" | "guide"; text: string };

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
    "off_topic",
    "reveals_answer_early",
  ]),
  reason: z.string(),
});

export type MainResult =
  | { kind: "ok"; reply: MainReply; usage: Partial<GuideUsage>; model: string }
  | { kind: "refused"; usage: Partial<GuideUsage>; model: string };

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
  reply(args: {
    text: string;
    history: Turn[];
    context: string;
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
