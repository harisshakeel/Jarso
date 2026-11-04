import { goalCopy } from "@jarso/core/goals";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { formatMoney, toUserMessage } from "@/lib";
import { GoalSheetButton } from "./goal-card";
import { GoalStaircase } from "./goal-staircase";
import { useGoal } from "./use-goal";

/** The goal's own screen (FR02): the full staircase, the figures, and the way to change it. */
export function GoalScreen() {
  const goal = useGoal();
  const home = useHome();
  const currency = home.data?.context.currency;
  const refresh = () => {
    void goal.refetch();
    if (home.error) void home.refetch();
  };

  if (goal.data === undefined || !currency) {
    const error = goal.error ?? home.error;
    return (
      <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
        {error ? (
          <>
            <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
              {toUserMessage(error)}
            </Text>
            <Button size="lg" accessibilityLabel="Try again" onPress={refresh}>
              <Text>Try again</Text>
            </Button>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading your goal" />
        )}
      </View>
    );
  }

  const view = goal.data;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <ScrollView
      testID="goal-scroll"
      className="bg-background"
      contentContainerClassName="gap-6 p-4 pb-8"
      refreshControl={<RefreshControl refreshing={goal.isRefetching} onRefresh={refresh} />}
    >
      {view ? (
        <>
          <Text accessibilityRole="header" className="text-center font-sans-bold text-h3">
            {goalCopy.card.title(view.goal.emoji, view.goal.name, money(view.goal.targetMinor))}
          </Text>
          <GoalStaircase goal={view.goal} progress={view.progress} currency={currency} />
          <View className="items-center">
            <GoalSheetButton hasGoal />
          </View>
        </>
      ) : (
        <View className="items-center gap-4 rounded-2xl bg-card p-6">
          <Text className="text-center">{goalCopy.card.empty}</Text>
          <GoalSheetButton hasGoal={false} />
        </View>
      )}
    </ScrollView>
  );
}
