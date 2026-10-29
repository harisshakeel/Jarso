import "server-only";
import { serverEnv } from "@/config/env.server";
import { createAnthropicProvider } from "./claude";
import { createFakeProvider } from "./fake-provider";
import type { GuideProvider } from "./provider";

/**
 * Whether the guide can run at all, and with which provider. Off unless FEATURE_GUIDE is "true".
 * The fake provider is refused on Vercel production, and the real one needs ANTHROPIC_API_KEY.
 * Each child still needs their parent's switch on (guide_access).
 */
export function guideProviderName(): "anthropic" | "fake" | null {
  if (!serverEnv.FEATURE_GUIDE) return null;
  if (serverEnv.GUIDE_PROVIDER === "fake") {
    return serverEnv.VERCEL_ENV === "production" ? null : "fake";
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

export function guideDailyBudgetCents(): number {
  return serverEnv.GUIDE_DAILY_BUDGET_CENTS;
}
