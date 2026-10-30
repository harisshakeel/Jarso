import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { routes } from "@/config";
import { getFamily, requireRole } from "@/features/family/server";
import { GuideSheet, StepGuide } from "@/features/guide";
import { getGuideState } from "@/features/guide/server";
import { MissionPlayer, TopicView } from "@/features/learning";
import { findMission, findTopic } from "@/features/learning/server";

// The guide action runs on this page: allow a full guide turn (45 s) plus saving it.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Topic" };

type Props = {
  params: Promise<{ topicKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function TopicContent({ params, searchParams }: Props) {
  const [{ topicKey }, query] = await Promise.all([params, searchParams]);
  const { user } = await requireRole("child", routes.childTopic(topicKey));
  const topic = findTopic(topicKey);
  const [family, guide] = await Promise.all([getFamily(), getGuideState(user.id)]);
  if (!topic || !family) notFound();
  // FR08: the child can explore a topic and return to their unfinished mission.
  const from = typeof query.from === "string" ? findMission(query.from) : undefined;
  const back = from
    ? { href: routes.childMission(from.key), label: `Back to "${from.title}"` }
    : { href: routes.childLearn, label: "Learn" };
  return (
    <>
      <Link
        href={back.href}
        className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-full pr-2 font-semibold text-primary text-sm hover:underline hover:underline-offset-4"
      >
        <ChevronLeftIcon aria-hidden className="size-5" />
        {back.label}
      </Link>
      <header className="grid gap-1">
        <p className="eyebrow">Topic</p>
        <h1 className="text-balance text-h1">{topic.title}</h1>
      </header>
      <TopicView topic={topic} currency={family.currency} />
      {guide.available ? (
        <div>
          <GuideSheet
            context={{ entry: "topic", topicKey: topic.key }}
            introNeeded={guide.introNeeded}
            triggerLabel="Ask about this"
          />
        </div>
      ) : null}
      <section aria-labelledby="topic-practice" className="grid gap-3">
        <h2 id="topic-practice" className="text-h3">
          Try one
        </h2>
        <MissionPlayer
          mode={{ kind: "topic" }}
          steps={[topic.practice]}
          currency={family.currency}
          doneHref={back.href}
          doneLabel={from ? "Back to your mission" : "Back to Learn"}
          stepAside={guide.available ? <StepGuide introNeeded={guide.introNeeded} /> : undefined}
        />
      </section>
    </>
  );
}

export default function TopicPage({
  params,
  searchParams,
}: PageProps<"/child/learn/topics/[topicKey]">) {
  return (
    <div className="mx-auto grid w-full max-w-xl gap-5">
      <Suspense fallback={<div aria-hidden className="shimmer h-96 rounded-2xl bg-muted" />}>
        <TopicContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
