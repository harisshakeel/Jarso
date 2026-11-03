import { learnCopy, weeklyRhythmLine } from "@jarso/core/learning";
import { useRouter } from "expo-router";
import { CalendarCheckIcon, ChevronRightIcon } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CoachSays } from "@/components/screen";
import { Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { NextStepCard, PageWait, Roadmap, useLearningOverview } from "@/features/learning";
import { useTokens } from "@/lib";

/**
 * Learn (the web's child/learn): the week's rhythm, a coach, whatever comes before a mission
 * (check-in, practice, a comeback question) as one card, "Your week", then the seven-day road.
 */
export function LearnScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const home = useHome();
  const overview = useLearningOverview(home.data?.context.timezone);
  const refresh = () => {
    void overview.refetch();
    if (home.error) void home.refetch();
  };

  const body = (() => {
    if (!overview.data) {
      return <PageWait error={overview.error ?? home.error} onRetry={refresh} />;
    }
    const { nextStep, daysThisWeek, journey } = overview.data;
    const cardFirst = nextStep.kind !== "mission" && nextStep.kind !== "resume";
    return (
      <>
        <Text className="text-muted-foreground">{weeklyRhythmLine(daysThisWeek)}</Text>
        <CoachSays coachKey="learn" moment="learn" />
        {cardFirst ? <NextStepCard step={nextStep} /> : null}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={learnCopy.yourWeek}
          onPress={() => router.push("/(child)/learn/week")}
          className="min-h-11 flex-row items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
        >
          <View className="flex-row items-center gap-2">
            <CalendarCheckIcon size={20} color={tokens.primary} />
            <Text className="font-sans-semibold">{learnCopy.yourWeek}</Text>
          </View>
          <ChevronRightIcon size={20} color={tokens.foreground} />
        </Pressable>
        <Roadmap journey={journey} />
      </>
    );
  })();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-10"
        refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={refresh} />}
      >
        <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
          {learnCopy.heading}
        </Text>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}
