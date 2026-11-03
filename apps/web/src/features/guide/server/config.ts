import "server-only";
import { serverEnv } from "@/config/env.server";
import { createAnthropicProvider } from "./claude";
import { createFakeProvider } from "./fake-provider";
import type { GuideProvider } from "./provider";
import {
  createAnthropicSummaryWriter,
  createFakeSummaryWriter,
  type SummaryWriter,
} from "./summary";
import { createAnthropicPriceReader, createFakePriceReader, type PriceReader } from "./vision";

/**
 * Whether the guide can run at all, and with which provider. Off unless FEATURE_GUIDE is "true".
 * The fake provider needs GUIDE_ALLOW_FAKE and is refused on Vercel production; the real one
 * needs ANTHROPIC_API_KEY.
 * Each child still needs their parent's switch on (guide_access).
 */
export function guideProviderName(): "anthropic" | "fake" | null {
  if (!serverEnv.FEATURE_GUIDE) return null;
  if (serverEnv.GUIDE_PROVIDER === "fake") {
    // Keyword routing is fine for tests, never for children: two opt-ins, and never on Vercel
    // production.
    return serverEnv.GUIDE_ALLOW_FAKE && serverEnv.VERCEL_ENV !== "production" ? "fake" : null;
  }
  return serverEnv.ANTHROPIC_API_KEY ? "anthropic" : null;
}

let provider: GuideProvider | null | undefined;

/** The provider for this server instance, created once. Null when the guide is off. */
export function getGuideProvider(): GuideProvider | null {
  if (provider !== undefined) return provider;
  const name = guideProviderName();
  provider =
    name === "fake"
      ? createFakeProvider()
      : name === "anthropic" && serverEnv.ANTHROPIC_API_KEY
        ? createAnthropicProvider(serverEnv.ANTHROPIC_API_KEY)
        : null;
  return provider;
}

let priceReader: PriceReader | null | undefined;

/** The photo price reader, on the same switch and provider as the guide. Null when it is off. */
export function getPriceReader(): PriceReader | null {
  if (priceReader !== undefined) return priceReader;
  const name = guideProviderName();
  priceReader =
    name === "fake"
      ? createFakePriceReader()
      : name === "anthropic" && serverEnv.ANTHROPIC_API_KEY
        ? createAnthropicPriceReader(serverEnv.ANTHROPIC_API_KEY)
        : null;
  return priceReader;
}

let summaryWriter: SummaryWriter | null | undefined;

/** The parent dashboard's summary writer, on the same switch and provider as the guide. */
export function getSummaryWriter(): SummaryWriter | null {
  if (summaryWriter !== undefined) return summaryWriter;
  const name = guideProviderName();
  summaryWriter =
    name === "fake"
      ? createFakeSummaryWriter()
      : name === "anthropic" && serverEnv.ANTHROPIC_API_KEY
        ? createAnthropicSummaryWriter(serverEnv.ANTHROPIC_API_KEY)
        : null;
  return summaryWriter;
}

export function guideDailyBudgetCents(): number {
  return serverEnv.GUIDE_DAILY_BUDGET_CENTS;
}

export function guideMonthlyBudgetCents(): number {
  return serverEnv.GUIDE_MONTHLY_BUDGET_CENTS;
}
