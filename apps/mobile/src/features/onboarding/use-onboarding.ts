import { type OnboardingGate, type OnboardingReward, onboardingGate } from "@jarso/core/onboarding";
import { completeOnboarding, findTour, saveTour } from "@jarso/data/tour";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/features/auth";
import { isAppError, logger } from "@/lib";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";
import { readOnboarded, writeOnboarded } from "./local-done";

const NOTHING: OnboardingReward = { sparks: 0, badge: null };

const codeOf = (error: unknown) => (isAppError(error) ? error.code : "UNKNOWN");

/**
 * Whether the child's intro shows now. The phone's cached flag first (no network for a returning
 * child), then the tour row; a tour that can't be read skips the intro for this run.
 */
export function useOnboardingGate(userId: string | undefined): OnboardingGate {
  const [local, setLocal] = useState<{ userId: string; done: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    void readOnboarded(userId).then((done) => {
      if (live) setLocal({ userId, done });
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const localDone = local && local.userId === userId ? local.done : null;
  const tour = useQuery({
    queryKey: keys.tour(userId ?? ""),
    enabled: Boolean(userId) && localDone === false,
    queryFn: () => findTour(supabase, userId as string),
  });

  const finishedAt = tour.data?.finishedAt ?? null;
  useEffect(() => {
    if (userId && finishedAt) void writeOnboarded(userId);
  }, [userId, finishedAt]);

  if (!userId) return "skip";
  return onboardingGate({
    localDone,
    tour: tour.isError ? "error" : tour.data ? { finishedAt: tour.data.finishedAt } : "loading",
  });
}

/** After the intro ends either way: remember it and read the tour and progress fresh. */
function useAfterIntro() {
  const { userId } = useSession();
  const queryClient = useQueryClient();
  return useCallback(
    async (refreshProgress: boolean) => {
      if (!userId) return;
      await writeOnboarded(userId);
      void queryClient.invalidateQueries({ queryKey: keys.tour(userId) });
      if (refreshProgress) void queryClient.invalidateQueries({ queryKey: keys.progress(userId) });
    },
    [userId, queryClient],
  );
}

/** Marks the tour finished; a failure is only logged. */
async function saveFinished(): Promise<void> {
  try {
    await saveTour(supabase, { finished: true });
  } catch (error) {
    logger.warn("intro finish not saved", { code: codeOf(error) });
  }
}

/**
 * Finishes the intro: the server marks it done and pays the welcome reward once. Before the new
 * function is live (or offline) it falls back to marking the tour done and pays nothing. Never
 * throws; two calls at once share one request.
 */
export function useFinishOnboarding(): { finish: () => Promise<OnboardingReward> } {
  const after = useAfterIntro();
  const running = useRef<Promise<OnboardingReward> | null>(null);

  const finish = useCallback(() => {
    if (running.current) return running.current;
    const run = (async () => {
      let reward = NOTHING;
      try {
        reward = await completeOnboarding(supabase);
      } catch (error) {
        logger.warn("intro reward failed", { code: codeOf(error) });
        await saveFinished();
      }
      await after(true);
      return reward;
    })();
    running.current = run;
    void run.finally(() => {
      running.current = null;
    });
    return run;
  }, [after]);

  return { finish };
}

/** Skips the intro: the tour is marked done (shared with the web tour). Never throws. */
export function useSkipOnboarding(): () => Promise<void> {
  const after = useAfterIntro();
  return useCallback(async () => {
    await saveFinished();
    await after(false);
  }, [after]);
}
