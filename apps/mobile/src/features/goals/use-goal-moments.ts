import { type GoalView, goalCopy, starsLit, starToCheer } from "@jarso/core/goals";
import { BADGES, SPARKS } from "@jarso/core/progress";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useCelebrate } from "@/components/celebrate";
import { useParentLabel } from "@/features/progress";
import { formatMoney, logger } from "@/lib";
import { useMarkCelebrated } from "./use-goal-mutations";

const starsKey = (goalId: string) => `jarso.goalStars.${goalId}`;

// Goal ids being handled right now: a GoalCard and a GoalScreen mounted together must not both
// cheer for the same new star.
const inFlight = new Set<string>();

/** The stars seen so far on this phone, or null on first sight (or when storage fails). */
async function readSeen(goalId: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(starsKey(goalId));
    const seen = raw === null ? null : Number(raw);
    return seen !== null && Number.isInteger(seen) && seen >= 0 && seen <= 4 ? seen : null;
  } catch (error) {
    logger.warn("Could not read the goal stars", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}

async function writeSeen(goalId: string, stars: number): Promise<void> {
  try {
    await AsyncStorage.setItem(starsKey(goalId), String(stars));
  } catch (error) {
    logger.warn("Could not save the goal stars", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

/**
 * Fires the goal's moments once: a star cheer (sheet celebration, Sparks chip) when a new quarter
 * lights, and the full reached celebration (then marks it celebrated). Goals seen for the first
 * time on this phone get no cheer, only the stars stored. Never throws.
 */
export function useGoalMoments(view: GoalView, currency: string): void {
  const celebrate = useCelebrate();
  const router = useRouter();
  const parent = useParentLabel();
  const mark = useMarkCelebrated();
  const latest = useRef({ celebrate, router, parent, mark, currency, view });
  latest.current = { celebrate, router, parent, mark, currency, view };

  const goalId = view?.goal.id;
  const lit = view ? starsLit(view.progress) : 0;
  const reached = Boolean(view?.goal.reachedAt && !view.goal.celebratedAt);

  // Fires on these three only; the rest is read through `latest`.
  useEffect(() => {
    if (!goalId || inFlight.has(goalId)) return;
    inFlight.add(goalId);
    void (async () => {
      try {
        const seen = await readSeen(goalId);
        await writeSeen(goalId, Math.max(seen ?? 0, lit));
        const { celebrate, router, parent, mark, currency, view } = latest.current;
        if (!view) return;
        if (reached) {
          const money = formatMoney(view.goal.targetMinor, currency, { showMinor: "nonzero" });
          celebrate({
            title: goalCopy.page.reachedTitle,
            subtitle: goalCopy.page.reachedSub(money, view.goal.name),
            tone: "gold",
            mood: "cheer",
            fill: 0.95,
            chips: [
              { icon: "zap", label: `+${SPARKS.goalReached}` },
              { icon: "award", label: BADGES.goal_reached.name },
            ],
            primary: {
              label: goalCopy.page.askToBuy(parent),
              onPress: () => router.push("/(child)/take-out"),
            },
            secondary: { label: goalCopy.page.keepSaving },
          });
          mark.mutateAsync(goalId).catch((error: unknown) => {
            // Offline: the moment simply shows again next time.
            logger.warn("Could not save the goal moment", {
              error: error instanceof Error ? error.name : "unknown",
            });
          });
          return;
        }
        const star = starToCheer(seen, lit);
        if (star === null) return;
        celebrate({
          title: goalCopy.page.starTitle(star),
          mood: "cheer",
          sheet: true,
          chips: [{ icon: "zap", label: `+${SPARKS.goalMilestone}` }],
          primary: { label: "Nice!" },
        });
      } finally {
        inFlight.delete(goalId);
      }
    })();
  }, [goalId, lit, reached]);
}
