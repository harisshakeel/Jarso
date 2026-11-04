import { jarCapacity } from "@jarso/core/ledger";
import { useQueryClient } from "@tanstack/react-query";
import { type Href, useRouter } from "expo-router";
import { CircleUserRoundIcon } from "lucide-react-native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, CardSeparator, ListRow, ScreenHeader } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { PendingPurchases } from "@/features/diary";
import { GoalCard, HomeStepCard } from "@/features/goals";
import { JarGraph, JarsCard, useHome } from "@/features/jars";
import { PushPermissionCard } from "@/features/push";
import { useNickname } from "@/features/settings";
import { formatMoney, todayLine, toUserMessage, useTokens } from "@/lib";
import { keys } from "@/lib/query";

type Action = { label: string; href: Href };

/** The two quick actions inside the jars card. */
const QUICK: Action[] = [
  { label: "Spent something?", href: "/(child)/purchase" },
  { label: "Put some in Save", href: "/(child)/put-in" },
];

/** The other actions, as rows of one card (lists over stacked buttons). */
const MORE: Action[] = [
  { label: "Take some out", href: "/(child)/take-out" },
  { label: "Got money", href: "/(child)/received" },
  { label: "Ask for extra", href: "/(child)/ask-extra" },
  { label: "Move my money", href: "/(child)/requests" },
];

/**
 * The child's Home (mockup B): the date over the greeting, both jars in one card with the two
 * quick actions, purchases not sent yet, the one next thing, the goal, the other actions as a
 * list, then how the jars moved. The avatar opens Me. The cards after the jars are nice to have:
 * each hides itself if it can't load.
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
        contentContainerClassName="gap-3.5 px-4 pt-2 pb-8"
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refresh} />}
      >
        <ScreenHeader
          size="display"
          overline={todayLine(new Date(), context.timezone)}
          title={nickname ? `Hi, ${nickname}!` : "Hi!"}
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Me"
              onPress={() => router.push("/(child)/me")}
              className="h-12 w-12 items-center justify-center rounded-full bg-secondary"
            >
              <CircleUserRoundIcon size={26} color={tokens["secondary-foreground"]} />
            </Pressable>
          }
        />
        <PushPermissionCard />
        <JarsCard
          total={money(jars.spend + jars.save)}
          spend={{
            name: "Spend",
            amount: money(jars.spend),
            caption: "Cash you have",
            share: jars.spend / capacity,
            notes:
              availability.heldSpendMinor > 0
                ? [`${money(availability.heldSpendMinor)} to Save · give it to your parent`]
                : [],
          }}
          save={{
            name: "Save",
            amount: money(jars.save),
            caption: "Kept by your parent",
            share: counted / capacity,
            notes:
              availability.reservedSaveMinor > 0
                ? [`${money(availability.reservedSaveMinor)} · Waiting to come out`]
                : [],
          }}
          actions={QUICK.map((action) => (
            <Button
              key={action.label}
              variant="secondary"
              className="h-12 flex-1 px-2"
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={() => router.push(action.href)}
            >
              <Text numberOfLines={1}>{action.label}</Text>
            </Button>
          ))}
        />
        {userId ? <PendingPurchases userId={userId} currency={context.currency} /> : null}
        <HomeStepCard currency={context.currency} timezone={context.timezone} />
        <GoalCard currency={context.currency} />
        <Card className="gap-0 py-1">
          {MORE.map((action, i) => (
            <View key={action.label}>
              {i > 0 ? <CardSeparator /> : null}
              <ListRow label={action.label} onPress={() => router.push(action.href)} />
            </View>
          ))}
        </Card>
        <JarGraph jars={jars} context={context} />
      </ScrollView>
    </SafeAreaView>
  );
}
