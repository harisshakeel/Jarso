import { heroLine, homeCopy, selectMoments } from "@jarso/core/home";
import { jarsoFill, moodFor } from "@jarso/core/mascot";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { PendingPurchases } from "@/features/diary";
import { GoalCard, useGoal } from "@/features/goals";
import { useHome } from "@/features/jars";
import { NextStepCard, useLearningOverview } from "@/features/learning";
import { useUnreadCount } from "@/features/news";
import { useParentLabel, useProgress } from "@/features/progress";
import { useRequests } from "@/features/requests";
import { useNickname } from "@/features/settings";
import { formatMoney, toUserMessage } from "@/lib";
import { keys } from "@/lib/query";
import { HomeHeader } from "./home-header";
import { HomeHero } from "./home-hero";
import { JarTile } from "./jar-tile";
import { MomentCard } from "./moment-card";
import { useAllowanceDue, useHomeWeek } from "./use-home-extras";

/**
 * The child's Home: header, then either what just happened (moment cards) or Jarso with one
 * line, then Spend and Save, the goal and today's mission. Every read after the jars is nice to
 * have: if it can't load, Home goes on without it.
 */
export function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const { data, error, isPending, isRefetching, refetch } = useHome();
  const { data: nickname } = useNickname();
  const { data: progress } = useProgress();
  const { data: unread } = useUnreadCount();
  const { data: requests } = useRequests();
  const { data: goal } = useGoal();
  const due = useAllowanceDue();
  const parent = useParentLabel();
  const learning = useLearningOverview(data?.context.timezone);
  const week = useHomeWeek(data?.context);

  const refresh = () => {
    if (!userId) return;
    // `home` also covers the due and week reads (they share its prefix).
    for (const key of [
      keys.home(userId),
      keys.goal(userId),
      keys.learning(userId),
      keys.requests(userId),
      keys.progress(userId),
      keys.unread(userId),
    ]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  // Also the state while `userId` is missing (the query is disabled). The (child) layout only
  // renders this screen for a `child` session, which always has a userId, so it can't persist.
  if (isPending && !error) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading your jars" />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-6 px-6">
          <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
            {toUserMessage(error)}
          </Text>
          <Button size="lg" accessibilityLabel="Try again" onPress={() => void refetch()}>
            <Text>Try again</Text>
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  const { jars, context } = data;
  const money = (minor: number) => formatMoney(minor, context.currency, { showMinor: "nonzero" });
  const moments = selectMoments({ requests: requests ?? null, due });
  const hero = heroLine({ jars, movements: week, today: context.today, money });
  const fill = jarsoFill({
    saveMinor: jars.save,
    spendMinor: jars.spend,
    goalTargetMinor: goal?.goal.targetMinor ?? null,
  });

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        testID="home-scroll"
        contentContainerClassName="gap-3.5 px-4 pt-2 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} />}
      >
        <HomeHeader
          nickname={nickname ?? null}
          look={progress?.look}
          streak={progress?.streak ?? 0}
          sparks={progress?.sparks ?? null}
          unread={unread ?? 0}
        />
        {moments.length > 0 ? (
          moments.map((moment) => (
            <MomentCard
              key={moment.kind === "allowance-due" ? "due" : `${moment.kind}-${moment.request.id}`}
              moment={moment}
              money={money}
              parent={parent}
              onPress={
                moment.kind === "allowance-due" ? undefined : () => router.push("/(child)/requests")
              }
            />
          ))
        ) : (
          <HomeHero
            text={hero.text}
            mood={moodFor(hero.moment)}
            fill={fill}
            look={progress?.look}
          />
        )}
        {userId ? <PendingPurchases userId={userId} currency={context.currency} /> : null}
        <View className="flex-row gap-3">
          <JarTile
            jar="spend"
            amount={money(jars.spend)}
            caption={homeCopy.spendTile.caption}
            onPress={() => router.push("/(child)/jar/spend")}
          />
          <JarTile
            jar="save"
            onPress={() => router.push("/(child)/jar/save")}
            amount={money(jars.save)}
            caption={homeCopy.saveTile.caption(parent)}
          />
        </View>
        <GoalCard currency={context.currency} />
        {learning.data ? <NextStepCard step={learning.data.nextStep} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
