import { goalCopy, starsLit, toGoLine, weeksToGoal } from "@jarso/core/goals";
import { useRouter } from "expo-router";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { useParentLabel } from "@/features/progress";
import { formatMoney, toUserMessage } from "@/lib";
import { GoalSheetButton } from "./goal-card";
import { GoalRing } from "./goal-ring";
import { MilestoneStars } from "./milestone-stars";
import { useGoal, useSavingPace } from "./use-goal";
import { useGoalMoments } from "./use-goal-moments";

/**
 * The goal's own screen (FR02, mockup J2): the goal in a big gold ring, how much is saved, four
 * stars, what is left (and about how many weeks), and the way to save more or change the goal.
 * Reached: the ring is full and the next step is to ask the parent.
 */
export function GoalScreen() {
  const router = useRouter();
  const goal = useGoal();
  const home = useHome();
  const pace = useSavingPace();
  const parent = useParentLabel();
  const currency = home.data?.context.currency;
  useGoalMoments(currency ? (goal.data ?? null) : null, currency ?? "");
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
  const scroll = (children: React.ReactNode) => (
    <ScrollView
      testID="goal-scroll"
      className="bg-background"
      contentContainerClassName="gap-6 p-4 pb-8"
      refreshControl={<RefreshControl refreshing={goal.isRefetching} onRefresh={refresh} />}
    >
      {children}
    </ScrollView>
  );

  if (!view) {
    return scroll(
      <View className="items-center gap-4 rounded-2xl bg-card p-6">
        <Text className="text-center">{goalCopy.card.empty}</Text>
        <GoalSheetButton hasGoal={false} />
      </View>,
    );
  }

  const { goal: g, progress } = view;
  const saved = goalCopy.page.ofTarget(money(progress.countedMinor), money(g.targetMinor));
  const toGo = toGoLine(
    progress,
    weeksToGoal({
      remainingMinor: progress.remainingMinor,
      planMinor: g.planMinor,
      frequency: pace.frequency,
    }),
    money,
  );
  return scroll(
    <>
      <View className="items-center gap-3">
        <GoalRing
          emoji={g.emoji}
          value={progress.fillRatio}
          size={200}
          label={`${g.name}, ${saved}`}
        />
        <Text accessibilityRole="header" className="text-center font-sans-extrabold text-h1">
          {g.name}
        </Text>
        <Text className="font-sans-bold text-gold-text text-money-m">{saved}</Text>
      </View>
      <MilestoneStars lit={starsLit(progress)} />
      {toGo ? (
        <View className="items-center">
          <View className="rounded-full bg-gold px-4 py-2">
            <Text className="font-sans-bold text-gold-foreground">{toGo}</Text>
          </View>
        </View>
      ) : null}
      {progress.reached ? (
        <Button
          size="lg"
          variant="keycap-gold"
          accessibilityLabel={goalCopy.page.askToBuy(parent)}
          onPress={() => router.push("/(child)/take-out")}
        >
          <Text>{goalCopy.page.askToBuy(parent)}</Text>
        </Button>
      ) : (
        <Button
          size="lg"
          variant="keycap-gold"
          accessibilityLabel={goalCopy.page.saveSome}
          onPress={() => router.push("/(child)/put-in")}
        >
          <Text>{goalCopy.page.saveSome}</Text>
        </Button>
      )}
      <View className="items-center">
        <GoalSheetButton hasGoal />
      </View>
    </>,
  );
}
