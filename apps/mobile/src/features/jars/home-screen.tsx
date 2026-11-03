import { jarCapacity } from "@jarso/core/ledger";
import { type Href, useRouter } from "expo-router";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { useNickname } from "@/features/settings";
import { formatMoney, toUserMessage } from "@/lib";
import { JarCard } from "./jar-card";
import { useHome } from "./use-jars";

type Action = { label: string; href: Href; gold?: boolean };

const ACTIONS: Action[] = [
  { label: "Spent something?", href: "/(child)/purchase", gold: true },
  { label: "Put some in Save", href: "/(child)/put-in" },
  { label: "Take some out", href: "/(child)/take-out" },
  { label: "Ask for extra", href: "/(child)/ask-extra" },
];

/** The child's Home: the two jars, what is waiting, and the four things they can do. */
export function HomeScreen() {
  const router = useRouter();
  const { data, error, isPending, isRefetching, refetch } = useHome();
  const { data: nickname } = useNickname();

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
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
      >
        <Text accessibilityRole="header" className="font-sans-extrabold text-display">
          {nickname ? `Hi, ${nickname}!` : "Hi!"}
        </Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}
