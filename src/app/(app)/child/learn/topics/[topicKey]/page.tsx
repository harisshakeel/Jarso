import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { routes } from "@/config";
import { getFamily, requireRole } from "@/features/family/server";
import { MissionPlayer, TopicView } from "@/features/learning";
import { findMission, findTopic } from "@/features/learning/server";

export const metadata: Metadata = { title: "Topic" };

type Props = {
  params: Promise<{ topicKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function TopicContent({ params, searchParams }: Props) {
  const [{ topicKey }, query] = await Promise.all([params, searchParams]);
  await requireRole("child", routes.childTopic(topicKey));
  const topic = findTopic(topicKey);
  const family = await getFamily();
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
