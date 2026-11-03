import { goalCopy } from "@jarso/core/goals";
import { chooseHomeStep, type HomeStep } from "@jarso/core/learning";
import { listRequestsFor } from "@jarso/data/requests";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CircleCheckIcon } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { NextStepCard, useLearningOverview } from "@/features/learning";
import { formatMoney, logger, useTokens } from "@/lib";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";
import { GoalSheetButton } from "./goal-card";
import { useGoal } from "./use-goal";
import { useMarkCelebrated } from "./use-goal-mutations";

/**
 * The one next thing for child Home (spec §6.1), chosen by core's `chooseHomeStep` as on the web.
 * Learning leads; the goal and requests only shape the step, so if they fail it still shows.
 * Null while loading or if learning can't load: Home goes on without it.
 */
function useHomeStep(timezone: string): HomeStep | null {
  const { userId } = useSession();
  const learning = useLearningOverview(timezone);
  const goal = useGoal();
  // Same key and read as the Requests screen, so they share one cache.
  const requests = useQuery({
    queryKey: keys.requests(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => listRequestsFor(supabase, userId as string),
  });
  if (!learning.data) return null;
  if (goal.isPending && !goal.error) return null;
  if (requests.isPending && !requests.error) return null;
  const approved = (requests.data ?? []).find(
    (r) => r.kind === "withdrawal" && r.status === "approved",
  );
  return chooseHomeStep({
    goal: goal.data ?? null,
    approvedWithdrawal: approved ? { amountMinor: approved.amountMinor } : null,
    learning: learning.data.nextStep,
  });
}

/** "Do this next" on child Home: one thing, in plain words, with at most one button. */
export function HomeStepCard({ currency, timezone }: { currency: string; timezone: string }) {
  const step = useHomeStep(timezone);
  if (!step) return null;
  if (step.kind === "learning") return <NextStepCard step={step.step} />;
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Text className="font-sans-bold text-muted-foreground text-sm uppercase">
        {step.kind === "goal-reached" ? goalCopy.home.goalReachedEyebrow : goalCopy.home.doThisNext}
      </Text>
      <StepBody step={step} currency={currency} />
    </View>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="font-sans-bold text-h3">
      {children}
    </Text>
  );
}

function StepBody({ step, currency }: { step: HomeStep; currency: string }) {
  switch (step.kind) {
    case "goal-reached":
      return (
        <GoalReached
          goalId={step.goalId}
          title={goalCopy.home.reachedTitle(step.emoji, step.name)}
        />
      );
    case "withdrawal-approved":
      return (
        <>
          <Heading>{goalCopy.home.approvedTitle}</Heading>
          <Text className="text-muted-foreground">
            {goalCopy.home.approvedBody(
              formatMoney(step.amountMinor, currency, { showMinor: "nonzero" }),
            )}
          </Text>
        </>
      );
    case "set-goal":
      return (
        <>
          <Heading>{goalCopy.home.setGoalTitle}</Heading>
          <Text className="text-muted-foreground">{goalCopy.home.setGoalBody}</Text>
          <View className="flex-row">
            <GoalSheetButton hasGoal={false} />
          </View>
        </>
      );
    case "all-done":
      return (
        <>
          <Heading>{goalCopy.home.allDoneTitle}</Heading>
          <Text className="text-muted-foreground">{goalCopy.home.allDoneBody}</Text>
        </>
      );
    default:
      return null;
  }
}

/** Shown once: marks the moment as celebrated on mount (best effort). No confetti (design.md §8). */
function GoalReached({ goalId, title }: { goalId: string; title: string }) {
  const router = useRouter();
  const tokens = useTokens();
  const mark = useMarkCelebrated();
  const marked = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per goal, whatever `mark` is
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    // If it fails (offline), the moment simply shows again next time.
    mark.mutateAsync(goalId).catch((error: unknown) => {
      logger.warn("Could not save the goal moment", {
        error: error instanceof Error ? error.name : "unknown",
      });
    });
  }, [goalId]);
  return (
    <>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CircleCheckIcon size={40} color={tokens.primary} />
      </View>
      <Heading>{title}</Heading>
      <Text className="text-muted-foreground">{goalCopy.home.reachedBody}</Text>
      <View className="flex-row">
        <Button
          size="lg"
          className="bg-gold"
          accessibilityLabel={goalCopy.home.askToUse}
          onPress={() => router.push("/(child)/take-out")}
        >
          <Text className="text-gold-foreground">{goalCopy.home.askToUse}</Text>
        </Button>
      </View>
    </>
  );
}
