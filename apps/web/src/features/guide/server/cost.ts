import "server-only";
import type { GuideUsage } from "../types";

/**
 * US dollars per million tokens (Anthropic list prices, checked 2026-10-30). Cache writes cost
 * 1.25× input. Used only for the daily and monthly budgets; the Console spend limit is the backstop.
 */
const PRICES = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  // Earlier replies (ADR 0010) still count toward this month's budget at their own price.
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
} as const;

/** Jarso's answers and look-ups (ADR 0011). Changing it means re-running the evals. */
export const MAIN_MODEL = "claude-sonnet-5-5";
/** Low suits chat; raise it only if the evals show tool use or answers need it. */
export const MAIN_EFFORT = "low";
export const SCREEN_MODEL = "claude-haiku-5-5";

/** The cost of one turn's tokens, in US cents (fractional). */
export function usageCents(usage: GuideUsage, mainModel: string = MAIN_MODEL): number {
  const main = PRICES[mainModel as keyof typeof PRICES] ?? PRICES[MAIN_MODEL];
  const screen = PRICES[SCREEN_MODEL];
  const dollars =
    (usage.mainInput * main.input +
      usage.mainCacheWrite * main.input * 1.25 +
      usage.mainCacheRead * main.cacheRead +
      usage.mainOutput * main.output +
      usage.screenInput * screen.input +
      usage.screenOutput * screen.output) /
    1_000_000;
  return dollars * 100;
}

export const zeroUsage: GuideUsage = {
  mainInput: 0,
  mainOutput: 0,
  mainCacheRead: 0,
  mainCacheWrite: 0,
  screenInput: 0,
  screenOutput: 0,
};

export function addUsage(a: GuideUsage, b: Partial<GuideUsage>): GuideUsage {
  return {
    mainInput: a.mainInput + (b.mainInput ?? 0),
    mainOutput: a.mainOutput + (b.mainOutput ?? 0),
    mainCacheRead: a.mainCacheRead + (b.mainCacheRead ?? 0),
    mainCacheWrite: a.mainCacheWrite + (b.mainCacheWrite ?? 0),
    screenInput: a.screenInput + (b.screenInput ?? 0),
    screenOutput: a.screenOutput + (b.screenOutput ?? 0),
  };
}
