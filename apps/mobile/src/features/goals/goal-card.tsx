import { goalCopy, toGoLine, weeksToGoal } from "@jarso/core/goals";
import { useRouter } from "expo-router";
import { ChevronRightIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Card, ProgressBar } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";
import { GoalRing } from "./goal-ring";
import { useGoal, useSavingPace } from "./use-goal";
import { useGoalMoments } from "./use-goal-moments";

/**
 * "Your goal" on the child's Home (FR02, mockup B): a small gold ring with the goal's emoji, the
 * goal, how much of it is saved, a thin gold bar and one line saying what is left. The whole card
 * opens the goal's page. Without a goal, the invitation to set one. Nice to have: if it can't
 * load, Home goes on without it.
 */
export function GoalCard({ currency }: { currency: string }) {
  const router = useRouter();
  const tokens = useTokens();
  const goal = useGoal();
  const pace = useSavingPace();
  useGoalMoments(goal.data ?? null, currency);
  if (goal.data === undefined) return null;
  const view = goal.data;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });

  if (!view) {
    return (
      <Card accessibilityLabel={goalCopy.card.heading}>
        <Text accessibilityRole="header" className="font-sans-bold text-h3">
          {goalCopy.card.heading}
        </Text>
        <Text className="text-muted-foreground">{goalCopy.card.empty}</Text>
        <View className="flex-row">
          <GoalSheetButton hasGoal={false} />
        </View>
      </Card>
    );
  }

  const { goal: g, progress } = view;
  const left = progress.reached
    ? goalCopy.page.reachedTitle
    : toGoLine(
        progress,
        weeksToGoal({
          remainingMinor: progress.remainingMinor,
          planMinor: g.planMinor,
          frequency: pace.frequency,
        }),
        money,
      );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={goalCopy.card.seeIt}
      onPress={() => router.push("/(child)/goal")}
    >
      <Card className="flex-row items-center gap-4">
        <GoalRing emoji={g.emoji} value={progress.fillRatio} size={64} />
        <View className="min-w-0 flex-1 gap-1.5">
          <View className="flex-row items-center justify-between gap-2">
            <Text accessibilityRole="header" className="min-w-0 flex-1 font-sans-bold text-h3">
              {`${g.emoji} ${g.name}`}
            </Text>
            <ChevronRightIcon size={16} color={tokens.primary} />
          </View>
          <Text className="text-small text-muted-foreground">
            {goalCopy.card.ofTarget(money(progress.countedMinor), money(g.targetMinor))}
          </Text>
          <ProgressBar
            tone="gold"
            value={progress.fillRatio}
            accessibilityLabel={goalCopy.card.title(g.emoji, g.name, money(g.targetMinor))}
          />
          <Text className="font-sans-bold text-gold-text">{left}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

/** "Set a goal" / "Change my goal": opens the goal sheet. */
export function GoalSheetButton({ hasGoal }: { hasGoal: boolean }) {
  const router = useRouter();
  const label = hasGoal ? goalCopy.sheet.triggerChange : goalCopy.sheet.triggerNew;
  return (
    <Button
      variant="outline"
      size="lg"
      accessibilityLabel={label}
      onPress={() => router.push("/(child)/goal-sheet")}
    >
      <Text>{label}</Text>
    </Button>
  );
}
