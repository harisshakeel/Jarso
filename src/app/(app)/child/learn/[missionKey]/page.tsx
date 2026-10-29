import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { routes } from "@/config";
import { getFamily, requireRole } from "@/features/family/server";
import { StepGuide } from "@/features/guide";
import { getGuideState } from "@/features/guide/server";
import { MissionPlayer, topicTitles } from "@/features/learning";
import { findMission, getMissionSession, missionTopicKey } from "@/features/learning/server";
import { isAppError } from "@/lib";

export const metadata: Metadata = { title: "Mission" };

async function MissionContent({ params }: { params: Promise<{ missionKey: string }> }) {
  const { missionKey } = await params;
  const { user } = await requireRole("child", routes.childMission(missionKey));
  const mission = findMission(missionKey);
  if (!mission) notFound();
  const [family, guide, session] = await Promise.all([
    getFamily(),
    getGuideState(user.id),
    getMissionSession(mission.key).catch((error: unknown) => {
      // A locked mission sends the child back to the path rather than showing an error.
      if (isAppError(error) && error.code === "NOT_FOUND") return null;
      throw error;
    }),
  ]);
  if (!family) notFound();
  if (!session) redirect(routes.childLearn);
  const topicKey = missionTopicKey(mission);
  return (
    <MissionPlayer
      mode={{
        kind: "mission",
        missionKey: mission.key,
        attemptId: session.attemptId,
        results: session.results,
      }}
      steps={mission.steps}
      currency={family.currency}
      intro={{
        eyebrow: `Day ${mission.day} · ${topicTitles[mission.topic]}`,
        heading: mission.title,
        body: `${mission.summary} About three minutes. Hints are free.`,
      }}
      doneHref={routes.childLearn}
      doneLabel="Back to Learn"
      topicHref={routes.childTopic(topicKey, mission.key)}
      stepAside={guide.available ? <StepGuide introNeeded={guide.introNeeded} /> : undefined}
    />
  );
}

export default function MissionPage({ params }: PageProps<"/child/learn/[missionKey]">) {
  return (
    <div className="mx-auto grid w-full max-w-xl gap-4">
      <Link
        href={routes.childLearn}
        className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-full pr-2 font-semibold text-primary text-sm hover:underline hover:underline-offset-4"
      >
        <ChevronLeftIcon aria-hidden className="size-5" />
        Learn
      </Link>
      <Suspense fallback={<div aria-hidden className="shimmer h-80 rounded-2xl bg-muted" />}>
        <MissionContent params={params} />
      </Suspense>
    </div>
  );
}
