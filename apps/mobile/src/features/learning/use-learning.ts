import type { StepResult } from "@jarso/core/learning";
import { findMission } from "@jarso/core/learning/content";
import {
  getLearningOverview,
  getMissionSession,
  getPracticeSet,
  getWeeklyReview,
} from "@jarso/data/learning";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth";
import { apiFetch } from "@/lib/api";
import { outboxPlatform } from "@/lib/outbox";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";
import { withQueuedSteps } from "./queued";

/** The child's learning overview (journey, skills, next step). Days are the family's `timezone`. */
export function useLearningOverview(timezone: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.learning(userId ?? ""),
    enabled: Boolean(userId && timezone),
    queryFn: () =>
      getLearningOverview(supabase, userId as string, {
        timezone: timezone as string,
        now: new Date(),
      }),
  });
}

/** What's waiting in this child's outbox right now (read once, for a resume). */
async function queuedItems(userId: string) {
  const store = await outboxPlatform.openStore();
  return (await store?.listForUser(userId).catch(() => [])) ?? [];
}

export type MissionSessionView = { attemptId: string | null; results: StepResult[] };

/**
 * The open attempt of a mission and its results, plus the steps still waiting on the phone, so
 * a restart picks up after every answered step. Null when the mission is unknown or locked.
 * Always read fresh: a stale session would replay answered steps.
 */
export function useMissionSession(missionKey: string) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.mission(userId ?? "", missionKey),
    enabled: Boolean(userId),
    gcTime: 0,
    queryFn: async (): Promise<MissionSessionView | null> => {
      const id = userId as string;
      const mission = findMission(missionKey);
      if (!mission) return null;
      const [session, items] = await Promise.all([
        getMissionSession(supabase, id, missionKey),
        queuedItems(id),
      ]);
      if (!session) return null;
      return {
        attemptId: session.attemptId,
        results: withQueuedSteps(session.results, items, session.attemptId, mission.steps),
      };
    },
  });
}

/**
 * Starts (or reopens) a mission's attempt. Online only, through the web's /api/v1/learning/start,
 * which checks the mission exists and is unlocked. Adds the steps still queued on the phone.
 */
export function useStartMission() {
  const { userId } = useSession();
  return useMutation({
    mutationFn: async (missionKey: string): Promise<MissionSessionView> => {
      const started = await apiFetch<MissionSessionView>("/api/v1/learning/start", {
        method: "POST",
        auth: true,
        body: { missionKey },
      });
      const steps = findMission(missionKey)?.steps ?? [];
      const items = userId ? await queuedItems(userId) : [];
      return {
        attemptId: started.attemptId,
        results: withQueuedSteps(started.results, items, started.attemptId, steps),
      };
    },
  });
}

/** Today's practice set (due skills, new examples). Empty when nothing is due. */
export function usePracticeSet(timezone: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.practice(userId ?? ""),
    enabled: Boolean(userId && timezone),
    gcTime: 0,
    queryFn: () =>
      getPracticeSet(supabase, userId as string, {
        timezone: timezone as string,
        now: new Date(),
      }),
  });
}

/** The weekly review (FR11) in the family's timezone and currency. */
export function useWeeklyReview(context: { timezone: string; currency: string } | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.review(userId ?? ""),
    enabled: Boolean(userId && context),
    queryFn: () =>
      getWeeklyReview(supabase, userId as string, {
        timezone: context?.timezone as string,
        currency: context?.currency as string,
        now: new Date(),
      }),
  });
}
