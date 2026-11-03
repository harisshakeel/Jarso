import {
  formatShortDate,
  type JourneyMission,
  type LearningOverview,
  parentLearningCopy,
  roadmapCopy,
  type SkillLevel,
  skillLevelLabels,
  skills,
  summaryLine,
  topicTitles,
} from "@jarso/core/learning";
import { getFamilyContext } from "@jarso/data/family";
import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { Card, CardSeparator, Eyebrow, ListRow } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { cn, toUserMessage } from "@/lib";
import { keys } from "@/lib/query";
import { supabase } from "@/lib/supabase/client";
import { useChildLearning } from "./use-learning";

/**
 * A parent's read of one child's learning (the web's learning page): this week and the starting
 * check-in, missions done with how they went, skills, then the journey. Nothing here starts or
 * opens a mission. Learning is kept apart from money: no amounts.
 */
export function LearningSummary({ childId }: { childId: string }) {
  const { userId } = useSession();
  // The family's days (the same read the inbox uses), without importing the family feature.
  const context = useQuery({
    queryKey: keys.familyContext(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: () => getFamilyContext(supabase, userId as string),
    staleTime: 5 * 60_000,
  });
  const learning = useChildLearning(childId, context.data?.timezone);
  const failed = learning.error ?? context.error;
  const refresh = () => {
    void learning.refetch();
    if (context.error) void context.refetch();
  };

  if (!learning.data) {
    return (
      <View className="flex-1 items-center justify-center gap-6 bg-background px-6">
        {failed ? (
          <>
            <Text accessibilityRole="alert" className="text-center font-sans-bold text-h3">
              {toUserMessage(failed)}
            </Text>
            <Button size="lg" accessibilityLabel="Try again" onPress={refresh}>
              <Text>Try again</Text>
            </Button>
          </>
        ) : (
          <ActivityIndicator accessibilityLabel={parentLearningCopy.title} />
        )}
      </View>
    );
  }

  const overview = learning.data;
  const days = overview.daysThisWeek;
  return (
    <ScrollView
      className="bg-background"
      contentContainerClassName="gap-4 px-4 pt-2 pb-10"
      refreshControl={<RefreshControl refreshing={learning.isRefetching} onRefresh={refresh} />}
    >
      <Card className="gap-1">
        <SectionTitle>{parentLearningCopy.thisWeek}</SectionTitle>
        <Text>
          {days === 0 ? parentLearningCopy.noneThisWeek : parentLearningCopy.learnedOn(days)}
        </Text>
        <Text className="text-muted-foreground">
          {overview.checkIn
            ? parentLearningCopy.checkIn(overview.checkIn.correctCount)
            : parentLearningCopy.checkInNotDone}
        </Text>
      </Card>
      <Completed completed={overview.completed} />
      <Skills progress={overview.skills} />
      <Journey journey={overview.journey} />
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="font-sans-bold text-h3">
      {children}
    </Text>
  );
}

function Completed({ completed }: { completed: LearningOverview["completed"] }) {
  return (
    <Card className="gap-1">
      <SectionTitle>{parentLearningCopy.completedTitle}</SectionTitle>
      {completed.length === 0 ? (
        <Text className="text-muted-foreground">{parentLearningCopy.noneCompleted}</Text>
      ) : (
        completed.map((mission, index) => (
          <Fragment key={mission.attemptId}>
            {index > 0 ? <CardSeparator /> : null}
            <ListRow
              label={mission.title}
              detail={`${formatShortDate(mission.completedOn)} · ${summaryLine(mission)}`}
            />
          </Fragment>
        ))
      )}
    </Card>
  );
}

/** Every skill by topic, with its level in words and as three dots (the web's SkillList). */
function Skills({ progress }: { progress: LearningOverview["skills"] }) {
  const levelOf = (key: string): SkillLevel =>
    progress.find((item) => item.skillKey === key)?.level ?? 0;
  const topics = [...new Set(skills.map((skill) => skill.topic))];
  return (
    <Card className="gap-2">
      <SectionTitle>{parentLearningCopy.skills}</SectionTitle>
      {topics.map((topic) => (
        <View key={topic} className="gap-1">
          <Eyebrow tone="muted" header>
            {topicTitles[topic]}
          </Eyebrow>
          {skills
            .filter((skill) => skill.topic === topic)
            .map((skill) => {
              const level = levelOf(skill.key);
              return (
                <View
                  key={skill.key}
                  accessible
                  accessibilityLabel={`${skill.label}: ${skillLevelLabels[level]}`}
                  className="min-h-12 flex-row items-center gap-3"
                >
                  <Text className="min-w-0 flex-1 font-sans-semibold">{skill.label}</Text>
                  <Text className="text-muted-foreground text-small">
                    {skillLevelLabels[level]}
                  </Text>
                  <View className="flex-row gap-1">
                    {[1, 2, 3].map((dot) => (
                      <View
                        key={dot}
                        className={cn(
                          "size-2.5 rounded-full",
                          dot <= level ? "bg-primary" : "bg-muted",
                        )}
                      />
                    ))}
                  </View>
                </View>
              );
            })}
        </View>
      ))}
    </Card>
  );
}

/** The seven days as the parent sees them: done (when), started, the next one, or locked. */
function Journey({ journey }: { journey: JourneyMission[] }) {
  return (
    <Card accessibilityLabel={parentLearningCopy.journeyLabel} className="gap-1">
      <SectionTitle>{parentLearningCopy.journey}</SectionTitle>
      {journey.map((mission, index) => {
        const detail =
          mission.status === "done"
            ? parentLearningCopy.stopDone(
                mission.completedOn ? formatShortDate(mission.completedOn) : null,
              )
            : mission.status === "current"
              ? mission.inProgress
                ? parentLearningCopy.stopStarted
                : mission.summary
              : parentLearningCopy.stopLocked;
        return (
          <Fragment key={mission.key}>
            {index > 0 ? <CardSeparator /> : null}
            <ListRow label={roadmapCopy.stopName(mission.day, mission.title)} detail={detail} />
          </Fragment>
        );
      })}
    </Card>
  );
}
