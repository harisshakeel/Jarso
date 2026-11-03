import { learnCopy, topicTitles } from "@jarso/core/learning";
import { checkIn, findMission, findTopic, missionTopicKey } from "@jarso/core/learning/content";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Button, Text } from "@/components/ui";
import { useSession } from "@/features/auth";
import { openGuideSheet, useGuideState } from "@/features/guide";
import { useHome } from "@/features/jars";
import {
  EndCard,
  Eyebrow,
  LearnPage,
  MissionPlayer,
  PageWait,
  TopicView,
  useLearningOverview,
  useMissionSession,
  usePracticeSet,
  useWeeklyReview,
  WeekCard,
} from "@/features/learning";
import { useStepAside } from "./step-aside";

const LEARN = "/(child)/(tabs)/learn" as const;
const WEEK = "/(child)/learn/week" as const;

/**
 * The first value a read gave, kept while the player runs: a refetch (the finish refreshes
 * learning) must not swap the screen under the child, say from the finish to "All caught up".
 */
function useFirst<T>(value: T | undefined): T | undefined {
  const [first, setFirst] = useState(value);
  useEffect(() => {
    if (first === undefined && value !== undefined) setFirst(value);
  }, [first, value]);
  return first ?? value;
}

function Heading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="font-sans-extrabold text-h2">
      {children}
    </Text>
  );
}

/**
 * One mission (FR06). A locked or unknown mission goes back to Learn rather than showing an
 * error, as on the web. Resumes after the steps the server has and the ones queued on the phone.
 */
export function MissionScreen({ missionKey }: { missionKey: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const home = useHome();
  const session = useMissionSession(missionKey);
  const data = useFirst(session.data);
  const stepAside = useStepAside();
  const mission = findMission(missionKey);
  const locked = data === null;

  useEffect(() => {
    if (locked || !mission) router.dismissTo(LEARN);
  }, [locked, mission, router]);

  // Leaving half-way: Learn and Home show "keep going" with the new progress.
  useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: ["learning", userId] });
    },
    [queryClient, userId],
  );

  const currency = home.data?.context.currency;
  if (!mission || locked) return null;
  if (!data || !currency || !userId) {
    return (
      <PageWait
        error={session.error ?? home.error}
        onRetry={() => {
          void session.refetch();
          if (home.error) void home.refetch();
        }}
      />
    );
  }
  const topicKey = missionTopicKey(mission);
  return (
    <LearnPage>
      <MissionPlayer
        mode={{
          kind: "mission",
          missionKey: mission.key,
          attemptId: data.attemptId,
          results: data.results,
        }}
        steps={mission.steps}
        currency={currency}
        userId={userId}
        intro={{
          eyebrow: learnCopy.mission.eyebrow(mission.day, topicTitles[mission.topic]),
          heading: mission.title,
          body: learnCopy.mission.body(mission.summary),
        }}
        doneHref={LEARN}
        doneLabel={learnCopy.backToLearn}
        topicHref={{
          pathname: "/(child)/learn/topics/[topicKey]",
          params: { topicKey, from: mission.key },
        }}
        stepAside={stepAside}
      />
    </LearnPage>
  );
}

/** Practice (FR10): a short set of due skills in new examples, or "All caught up." */
export function PracticeScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const home = useHome();
  const items = usePracticeSet(home.data?.context.timezone);
  const steps = useFirst(items.data);
  const stepAside = useStepAside();
  const currency = home.data?.context.currency;
  if (!steps || !currency || !userId) {
    return <PageWait error={items.error ?? home.error} onRetry={() => void items.refetch()} />;
  }
  if (steps.length === 0) {
    return (
      <LearnPage>
        <EndCard
          heading={learnCopy.practice.caughtUpHeading}
          body={learnCopy.practice.caughtUpBody}
          action={learnCopy.backToLearn}
          onPress={() => router.dismissTo(LEARN)}
        />
      </LearnPage>
    );
  }
  return (
    <LearnPage>
      <Eyebrow>{learnCopy.practice.eyebrow}</Eyebrow>
      <Heading>{learnCopy.practice.heading}</Heading>
      <MissionPlayer
        mode={{ kind: "practice" }}
        steps={steps}
        currency={currency}
        userId={userId}
        doneHref={LEARN}
        doneLabel={learnCopy.backToLearn}
        stepAside={stepAside}
      />
    </LearnPage>
  );
}

/** The starting check-in: five questions, once. Done already shows the done state. */
export function CheckInScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const home = useHome();
  const overview = useLearningOverview(home.data?.context.timezone);
  const done = useFirst(overview.data ? overview.data.checkIn !== null : undefined);
  const currency = home.data?.context.currency;
  if (done === undefined || !currency || !userId) {
    return (
      <PageWait error={overview.error ?? home.error} onRetry={() => void overview.refetch()} />
    );
  }
  if (done) {
    return (
      <LearnPage>
        <EndCard
          heading={learnCopy.checkIn.doneHeading}
          body={learnCopy.checkIn.doneBody}
          action={learnCopy.backToLearn}
          onPress={() => router.dismissTo(LEARN)}
        />
      </LearnPage>
    );
  }
  return (
    <LearnPage>
      <MissionPlayer
        mode={{ kind: "check-in" }}
        steps={checkIn.questions}
        currency={currency}
        userId={userId}
        intro={{
          eyebrow: learnCopy.checkIn.eyebrow,
          heading: learnCopy.checkIn.heading,
          body: learnCopy.checkIn.body,
        }}
        doneHref={LEARN}
        doneLabel={learnCopy.checkIn.doneLabel}
      />
    </LearnPage>
  );
}

/**
 * A topic (FR08): the explanation, a worked example and one question to have a go at. Opening
 * a topic never changes progress, so its question saves nothing. `from` is the unfinished
 * mission to go back to.
 */
export function TopicScreen({ topicKey, from }: { topicKey: string; from?: string }) {
  const router = useRouter();
  const { userId } = useSession();
  const home = useHome();
  const stepAside = useStepAside();
  const guide = useGuideState();
  const topic = findTopic(topicKey);
  const back = from ? findMission(from) : undefined;

  useEffect(() => {
    if (!topic) router.dismissTo(LEARN);
  }, [topic, router]);

  const currency = home.data?.context.currency;
  if (!topic) return null;
  if (!currency || !userId) return <PageWait error={home.error} />;
  return (
    <LearnPage>
      <Heading>{topic.title}</Heading>
      <TopicView topic={topic} currency={currency} />
      {guide.data?.available === true ? (
        <Button
          variant="outline"
          size="lg"
          accessibilityLabel={learnCopy.topic.askAbout}
          className="self-start"
          onPress={() => openGuideSheet(router, { entry: "topic", topicKey: topic.key })}
        >
          <Text>{learnCopy.topic.askAbout}</Text>
        </Button>
      ) : null}
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {learnCopy.topic.haveAGo}
      </Text>
      <MissionPlayer
        mode={{ kind: "topic" }}
        steps={[topic.practice]}
        currency={currency}
        userId={userId}
        doneHref={
          back
            ? { pathname: "/(child)/learn/[missionKey]", params: { missionKey: back.key } }
            : LEARN
        }
        doneLabel={back ? learnCopy.topic.backToMission : learnCopy.backToLearn}
        stepAside={stepAside}
      />
    </LearnPage>
  );
}

/** "Your week" (FR11). */
export function WeekScreen() {
  const home = useHome();
  const review = useWeeklyReview(home.data?.context);
  const currency = home.data?.context.currency;
  if (!review.data || !currency) {
    return <PageWait error={review.error ?? home.error} onRetry={() => void review.refetch()} />;
  }
  return (
    <LearnPage refreshing={review.isRefetching} onRefresh={() => void review.refetch()}>
      <WeekCard review={review.data} currency={currency} />
    </LearnPage>
  );
}

/** The weekly review's fresh question (FR11): one review-pool item, played like practice. */
export function WeekQuestionScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const home = useHome();
  const review = useWeeklyReview(home.data?.context);
  const question = useFirst(review.data ? review.data.question : undefined);
  const stepAside = useStepAside();
  const currency = home.data?.context.currency;
  if (question === undefined || !currency || !userId) {
    return <PageWait error={review.error ?? home.error} onRetry={() => void review.refetch()} />;
  }
  if (!question) {
    return (
      <LearnPage>
        <EndCard
          heading={learnCopy.weekQuestion.nothingHeading}
          body={learnCopy.weekQuestion.nothingBody}
          action={learnCopy.weekQuestion.backToWeek}
          onPress={() => router.dismissTo(WEEK)}
        />
      </LearnPage>
    );
  }
  return (
    <LearnPage>
      <Eyebrow>{learnCopy.weekQuestion.eyebrow}</Eyebrow>
      <Heading>{learnCopy.weekQuestion.heading}</Heading>
      <MissionPlayer
        mode={{ kind: "practice" }}
        steps={[question]}
        currency={currency}
        userId={userId}
        doneHref={WEEK}
        doneLabel={learnCopy.weekQuestion.backToWeek}
        stepAside={stepAside}
      />
    </LearnPage>
  );
}
