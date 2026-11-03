import { jarCapacity } from "@jarso/core/ledger";
import { useQueryClient } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import { CircleUserRoundIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { PendingPurchases } from "@/features/diary";
import { GoalCard, HomeStepCard } from "@/features/goals";
import { JarCard, JarGraph, useHome } from "@/features/jars";
import { useNickname } from "@/features/settings";
import { formatMoney, toUserMessage, useTokens } from "@/lib";
import { keys } from "@/lib/query";

type Action = { label: string; href: Href; gold?: boolean };

const ACTIONS: Action[] = [
  { label: "Spent something?", href: "/(child)/purchase", gold: true },
  { label: "Put some in Save", href: "/(child)/put-in" },
  { label: "Take some out", href: "/(child)/take-out" },
  { label: "Got money", href: "/(child)/received" },
  { label: "Ask for extra", href: "/(child)/ask-extra" },
  { label: "Move my money", href: "/(child)/requests" },
];

/**
 * The child's Home, in the web's reading order: the jars and what they can do, how the jars
 * moved, purchases not sent yet, the one next thing, then the goal. The avatar opens Me. The
 * cards after the jars are nice to have: each hides itself if it can't load.
 */
export function HomeScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const { data, error, isPending, isRefetching, refetch } = useHome();
  const { data: nickname } = useNickname();
  const refresh = () => {
    void refetch();
    if (!userId) return;
    // Pull to refresh reads the cards again too (the graph shares Home's key).
    for (const key of [keys.goal(userId), keys.learning(userId), keys.requests(userId)]) {
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

  const { jars, availability, context } = data;
  const money = (minor: number) => formatMoney(minor, context.currency, { showMinor: "nonzero" });
  const capacity = jarCapacity({
    spendMinor: jars.spend,
    saveMinor: jars.save,
    allowanceMinor: null,
    currency: context.currency,
  });
  const counted = Math.max(jars.save - availability.reservedSaveMinor, 0);

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        testID="home-scroll"
        contentContainerClassName="gap-5 px-4 pt-6 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} />}
      >
        <View className="flex-row items-center justify-between gap-3">
          <Text
            accessibilityRole="header"
            className="min-w-0 flex-1 font-sans-extrabold text-display"
          >
            {nickname ? `Hi, ${nickname}!` : "Hi!"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Me"
            onPress={() => router.push("/(child)/me")}
            className="h-11 w-11 items-center justify-center rounded-full bg-secondary"
          >
            <CircleUserRoundIcon size={26} color={tokens["secondary-foreground"]} />
          </Pressable>
        </View>
        <View accessibilityLabel="Your jars" className="flex-row gap-4">
          <JarCard
            jar="spend"
            name="Spend"
            amount={money(jars.spend)}
            caption="Cash you have"
            share={jars.spend / capacity}
            notes={
              availability.heldSpendMinor > 0
                ? [`${money(availability.heldSpendMinor)} to Save · give it to your parent`]
                : []
            }
          />
          <JarCard
            jar="save"
            name="Save"
            amount={money(jars.save)}
            caption="Kept by your parent"
            share={counted / capacity}
            notes={
              availability.reservedSaveMinor > 0
                ? [`${money(availability.reservedSaveMinor)} · Waiting to come out`]
                : []
            }
          />
        </View>
        <View className="gap-3">
          {ACTIONS.map((action) => (
            <Button
              key={action.label}
              size="lg"
              variant={action.gold ? "default" : "outline"}
              className={action.gold ? "bg-gold" : undefined}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => router.push(action.href)}
            >
              <Text className={action.gold ? "text-gold-foreground" : undefined}>
                {action.label}
              </Text>
            </Button>
          ))}
        </View>
        <JarGraph jars={jars} context={context} />
        {userId ? <PendingPurchases userId={userId} currency={context.currency} /> : null}
        <HomeStepCard currency={context.currency} timezone={context.timezone} />
        <GoalCard currency={context.currency} />
      </ScrollView>
    </SafeAreaView>
  );
}
