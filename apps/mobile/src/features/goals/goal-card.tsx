import { goalCopy, goalLine } from "@jarso/core/goals";
import { useRouter } from "expo-router";
import { ChevronRightIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Card, ProgressBar } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";
import { useGoal } from "./use-goal";

/**
 * "Your goal" on the child's Home (FR02, mockup B): the goal, how much of it is saved, a thin
 * gold bar and one line saying what is left, with the way to the goal's screen (the staircase
 * lives there). Without a goal, the invitation to set one. Nice to have: if it can't load, Home
 * goes on without it.
 */
export function GoalCard({ currency }: { currency: string }) {
  const router = useRouter();
  const tokens = useTokens();
  const goal = useGoal();
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
  return (
    <Card accessibilityLabel={goalCopy.card.heading}>
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="min-w-0 flex-1 font-sans-bold text-h3">
          {`${g.emoji} ${g.name}`}
        </Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={goalCopy.card.seeIt}
          onPress={() => router.push("/(child)/goal")}
          className="min-h-12 flex-row items-center gap-1 rounded-full pl-2"
        >
          <Text className="font-sans-bold text-primary">{goalCopy.card.seeIt}</Text>
          <ChevronRightIcon size={16} color={tokens.primary} />
        </Pressable>
      </View>
      <Text className="text-small text-muted-foreground">
        {goalCopy.card.ofTarget(money(progress.countedMinor), money(g.targetMinor))}
      </Text>
      <ProgressBar
        tone="gold"
        value={progress.fillRatio}
        accessibilityLabel={goalCopy.card.title(g.emoji, g.name, money(g.targetMinor))}
      />
      <Text className="text-muted-foreground">{goalLine(progress, money)}</Text>
    </Card>
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
