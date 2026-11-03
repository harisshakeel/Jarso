import { learnCopy, weeklyRhythmLine } from "@jarso/core/learning";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, CoachSays, ListRow, ScreenHeader } from "@/components/screen";
import { Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { NextStepCard, PageWait, Roadmap, useLearningOverview } from "@/features/learning";

/**
 * Learn (the web's child/learn): the week's rhythm, a coach, whatever comes before a mission
 * (check-in, practice, a comeback question) as one card, "Your week", then the seven-day road.
 */
export function LearnScreen() {
  const router = useRouter();
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
        <Card className="py-1">
          <ListRow
            accessibilityRole="link"
            label={learnCopy.yourWeek}
            onPress={() => router.push("/(child)/learn/week")}
          />
        </Card>
        <Roadmap journey={journey} />
      </>
    );
  })();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-4 pb-10"
        refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={refresh} />}
      >
        <ScreenHeader title={learnCopy.heading} />
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}
