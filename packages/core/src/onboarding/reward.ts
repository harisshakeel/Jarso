import { z } from "zod";
import { BADGE_KEYS, type BadgeKey } from "../progress";

/** The welcome reward for finishing the intro. Mirrored by complete_child_onboarding SQL; keep in sync. */
export const ONBOARDING_REWARD = { sparks: 50, badge: "jar_starter" } as const;

const KNOWN: ReadonlySet<string> = new Set(BADGE_KEYS);

/** What complete_child_onboarding paid this call: 0 and null on a replay. An unknown badge reads as null. */
export const onboardingRewardSchema = z.object({
  sparks: z.number().int().min(0),
  badge: z
    .string()
    .nullable()
    .transform((key) => (key !== null && KNOWN.has(key) ? (key as BadgeKey) : null)),
});

export type OnboardingReward = z.infer<typeof onboardingRewardSchema>;
