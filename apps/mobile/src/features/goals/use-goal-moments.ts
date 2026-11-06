import { type GoalView, goalCopy, starsLit, starToCheer } from "@jarso/core/goals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useCelebrate } from "@/components/celebrate";
import { useParentLabel } from "@/features/progress";
import { formatMoney, logger } from "@/lib";
import { useMarkCelebrated } from "./use-goal-mutations";

const starsKey = (goalId: string) => `jarso.goalStars.${goalId}`;

// Per goal: a run in progress, and whether the inputs changed during it. A GoalCard and a
// GoalScreen mounted together must not both cheer for the same new star, and a change that lands
// while a run is reading storage is handled by one more run, never dropped.
const runs = new Map<string, { again: boolean }>();

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
 * Fires the goal's moments once: a star cheer (sheet celebration) when a new quarter
 * lights, and the full reached celebration (then marks it celebrated). Goals seen for the first
 * time on this phone get no cheer, only the stars stored. No reward chips: the server sometimes
 * pays nothing (capped or already passed), so a chip here could be false. Never throws.
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: `lit` and `reached` are triggers, read fresh from `latest`.
  useEffect(() => {
    if (!goalId) return;
    const running = runs.get(goalId);
    if (running) {
      running.again = true;
      return;
    }
    const run = { again: false };
    runs.set(goalId, run);
    void (async () => {
      try {
        // A re-run must not celebrate the reached goal again: its mark has settled, but another
        // mounted component may still hold the old view.
        let reachedDone = false;
        do {
          run.again = false;
          reachedDone = (await handle(goalId, latest, reachedDone)) || reachedDone;
        } while (run.again);
      } finally {
        runs.delete(goalId);
      }
    })();
  }, [goalId, lit, reached]);
}

type Inputs = {
  celebrate: ReturnType<typeof useCelebrate>;
  router: ReturnType<typeof useRouter>;
  parent: string;
  mark: ReturnType<typeof useMarkCelebrated>;
  currency: string;
  view: GoalView;
};

/** Handles the goal's current moment; true when it played the reached celebration. */
async function handle(
  goalId: string,
  latest: { current: Inputs },
  reachedDone: boolean,
): Promise<boolean> {
  const seen = await readSeen(goalId);
  // Read after the await: the newest props, not the ones that started this run.
  const { celebrate, router, parent, mark, currency, view } = latest.current;
  if (!view) return false;
  const lit = starsLit(view.progress);
  await writeSeen(goalId, Math.max(seen ?? 0, lit));
  if (view.goal.reachedAt && !view.goal.celebratedAt) {
    if (reachedDone) return false;
    const money = formatMoney(view.goal.targetMinor, currency, { showMinor: "nonzero" });
    celebrate({
      title: goalCopy.page.reachedTitle,
      subtitle: goalCopy.page.reachedSub(money, view.goal.name),
      tone: "gold",
      mood: "cheer",
      fill: 0.95,
      primary: {
        label: goalCopy.page.askToBuy(parent),
        onPress: () => router.push("/(child)/take-out"),
      },
      secondary: { label: goalCopy.page.keepSaving },
    });
    try {
      await mark.mutateAsync(goalId);
    } catch (error) {
      // Offline: the moment simply shows again next time.
      logger.warn("Could not save the goal moment", {
        error: error instanceof Error ? error.name : "unknown",
      });
    }
    return true;
  }
  const star = starToCheer(seen, lit);
  if (star === null) return false;
  celebrate({
    title: goalCopy.page.starTitle(star),
    mood: "cheer",
    sheet: true,
    primary: { label: goalCopy.page.nice },
  });
  return false;
}
