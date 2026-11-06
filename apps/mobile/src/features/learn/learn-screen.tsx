import { palette } from "@jarso/brand/tokens";
import {
  chestReward,
  currentQuestWeek,
  learnCopy,
  questCopy,
  questMap,
  roadmapCopy,
} from "@jarso/core/learning";
import { useRouter } from "expo-router";
import { FlameIcon, ZapIcon } from "lucide-react-native";
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ListRow, ScreenHeader } from "@/components/screen";
import { Text } from "@/components/ui";
import { useHome } from "@/features/jars";
import { NextStepCard, PageWait, QuestMap, useLearningOverview } from "@/features/learning";
import { useProgress } from "@/features/progress";

const MAP_MARGIN = 32;

/**
 * Learn: the week as a quest map with Jarso on today's stop and a chest at the end. Whatever
 * comes before a mission (check-in, practice, a comeback question) is one card above the map,
 * then "Your week".
 */
export function LearnScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const home = useHome();
  const overview = useLearningOverview(home.data?.context.timezone);
  const progress = useProgress();
  const refresh = () => {
    void overview.refetch();
    if (home.error) void home.refetch();
  };

  const stats = progress.data;
  const pills = stats ? (
    <View className="flex-row gap-2">
      <View
        accessible
        accessibilityLabel={questCopy.streak(stats.streak)}
        className="h-9 flex-row items-center gap-1 rounded-full bg-muted px-3"
      >
        <FlameIcon size={16} color={palette.blush} />
        <Text className="font-sans-bold">{stats.streak}</Text>
      </View>
      <View
        accessible
        accessibilityLabel={questCopy.sparks(stats.sparks)}
        className="h-9 flex-row items-center gap-1 rounded-full bg-tint-grape px-3"
      >
        <ZapIcon size={16} color={palette.grape["600"]} />
        <Text className="font-sans-bold">{stats.sparks}</Text>
      </View>
    </View>
  ) : null;

  const body = (() => {
    if (!overview.data) {
      return <PageWait error={overview.error ?? home.error} onRetry={refresh} />;
    }
    const { nextStep, journey } = overview.data;
    const mapWidth = width - MAP_MARGIN;
    const cardFirst = nextStep.kind !== "mission" && nextStep.kind !== "resume";
    const week = currentQuestWeek(questMap(journey, { width: mapWidth }));
    const now = week?.stops.find((stop) => stop.state === "now");
    return (
      <>
        {week ? (
          <View className="flex-row items-center gap-3 rounded-[24px] bg-grape-600 p-4">
            <View className="flex-1">
              <Text className="font-sans-bold text-grape-100 text-small">
                {questCopy.week(week.week)}
              </Text>
              <Text className="font-sans-extrabold text-h3 text-white">
                {now?.title ?? roadmapCopy.journeyDone}
              </Text>
            </View>
            <View className="rounded-full bg-white/20 px-3 py-1">
              <Text className="font-sans-bold text-white">
                {questCopy.count(week.done, week.total)}
              </Text>
            </View>
          </View>
        ) : null}
        {cardFirst ? <NextStepCard step={nextStep} /> : null}
        {week ? (
          <QuestMap
            week={week}
            width={mapWidth}
            reward={chestReward(week.week, {
              badges: stats?.badges.map((b) => b.key) ?? [],
              level: stats?.level ?? 1,
            })}
            look={stats?.look}
          />
        ) : null}
        <Card className="py-1">
          <ListRow
            accessibilityRole="link"
            label={learnCopy.yourWeek}
            onPress={() => router.push("/(child)/learn/week")}
          />
        </Card>
      </>
    );
  })();

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-4 px-4 pt-4 pb-10"
        refreshControl={<RefreshControl refreshing={overview.isRefetching} onRefresh={refresh} />}
      >
        <ScreenHeader title={questCopy.heading} trailing={pills} />
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}
