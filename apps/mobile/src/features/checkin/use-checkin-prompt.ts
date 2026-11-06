import { checkinDecision } from "@jarso/core/progress";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import { useSession } from "@/features/auth";
import { useHome } from "@/features/jars";
import { useProgress } from "@/features/progress";
import { familyToday, logger } from "@/lib";
import { readPromptDay, writePromptDay } from "./prompt-day";

/** Call on Home. On focus, asks the check-in once per family-local day; silent on any failure. */
export function useCheckinPrompt(): void {
  const router = useRouter();
  const { userId } = useSession();
  const timezone = useHome().data?.context.timezone;
  const progress = useProgress();
  const latest = useRef(progress);
  latest.current = progress;
  /** The day this run already pushed the check-in for, even if saving it failed. */
  const askedDay = useRef<string | null>(null);

  const run = useCallback(async () => {
    if (!userId || !timezone) return;
    const stored = await readPromptDay(userId);
    const decide = (data: { checkedInToday: boolean } | undefined, readAt: Date) => {
      const now = new Date();
      if (askedDay.current === familyToday(timezone, now)) return "skip" as const;
      return checkinDecision({
        timezone,
        now,
        lastPromptDay: stored,
        progress: data ? { checkedInToday: data.checkedInToday, readAt } : null,
      });
    };
    const current = latest.current;
    let decision = decide(current.data, new Date(current.dataUpdatedAt));
    if (decision === "refresh" || (decision === "skip" && !current.data)) {
      const fresh = await current.refetch();
      decision = decide(fresh.data, new Date());
    }
    if (decision !== "show") return;
    const day = familyToday(timezone, new Date());
    askedDay.current = day;
    await writePromptDay(userId, day);
    router.push("/(child)/checkin");
  }, [userId, timezone, router]);

  useFocusEffect(
    useCallback(() => {
      run().catch(() => logger.warn("The daily check-in prompt failed"));
    }, [run]),
  );
}
