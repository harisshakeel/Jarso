import { goalCopy } from "@jarso/core/goals";
import { useRouter } from "expo-router";
import { ChevronRightIcon, TargetIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";
import { GoalStaircase } from "./goal-staircase";
import { useGoal } from "./use-goal";

/**
 * "Your goal" on the child's Home (FR02): the compact staircase and the way to the goal's
 * screen; without a goal, the invitation to set one. Nice to have: if it can't load, Home goes
 * on without it.
 */
export function GoalCard({ currency }: { currency: string }) {
  const router = useRouter();
  const tokens = useTokens();
  const goal = useGoal();
  if (goal.data === undefined) return null;
  const view = goal.data;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });

  return (
    <View
      accessibilityLabel={goalCopy.card.heading}
      className="gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <TargetIcon size={20} color={tokens["gold-text"]} />
          </View>
          <Text accessibilityRole="header" className="font-sans-bold text-h3">
            {goalCopy.card.heading}
          </Text>
        </View>
        {view ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={goalCopy.card.seeIt}
            onPress={() => router.push("/(child)/goal")}
            className="min-h-11 flex-row items-center gap-1 rounded-full px-2"
          >
            <Text className="font-sans-bold text-primary">{goalCopy.card.seeIt}</Text>
            <ChevronRightIcon size={16} color={tokens.primary} />
          </Pressable>
        ) : null}
      </View>
      {view ? (
        <>
          <Text className="text-center font-sans-bold">
            {goalCopy.card.title(view.goal.emoji, view.goal.name, money(view.goal.targetMinor))}
          </Text>
          <GoalStaircase
            goal={view.goal}
            progress={view.progress}
            currency={currency}
            size="compact"
          />
        </>
      ) : (
        <View className="items-center gap-3">
          <Text className="text-center text-muted-foreground">{goalCopy.card.empty}</Text>
          <GoalSheetButton hasGoal={false} />
        </View>
      )}
    </View>
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
