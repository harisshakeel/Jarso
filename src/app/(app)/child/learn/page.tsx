import { BookOpenIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { requireRole } from "@/features/family/server";
import {
  NextStepCard,
  PathMap,
  SkillList,
  topicTitles,
  weeklyRhythmLine,
} from "@/features/learning";
import { getLearningOverview, topics } from "@/features/learning/server";

export const metadata: Metadata = { title: "Learn" };

async function LearnContent() {
  const { user } = await requireRole("child", routes.childLearn);
  const overview = await getLearningOverview(user.id);
  const showNext = overview.nextStep.kind !== "mission" && overview.nextStep.kind !== "done";
  return (
    <>
      <header className="grid gap-2">
        <h1 className="text-balance text-display">Seven days. Small missions.</h1>
        <p className="text-ink-2">{weeklyRhythmLine(overview.daysThisWeek)}</p>
      </header>
      {showNext ? <NextStepCard step={overview.nextStep} /> : null}
      <PathMap journey={overview.journey} />
      <section aria-labelledby="topics-heading" className="grid gap-3">
        <h2 id="topics-heading" className="text-h3">
          Topics
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {topics.map((topic) => (
            <li key={topic.key}>
              <Link
                href={routes.childTopic(topic.key)}
                className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-hairline bg-card px-4 py-3 font-semibold hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <BookOpenIcon aria-hidden className="size-5 text-primary" />
                  {topicTitles[topic.key]}
                </span>
                <ChevronRightIcon aria-hidden className="size-5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <SkillList progress={overview.skills} />
    </>
  );
}

function LearnSkeleton() {
  return (
    <div aria-hidden className="grid gap-4">
      <div className="shimmer h-11 w-64 rounded-lg bg-muted" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="shimmer h-20 rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export default function LearnPage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Suspense
        fallback={
          <SlowFallback>
            <LearnSkeleton />
          </SlowFallback>
        }
      >
        <LearnContent />
      </Suspense>
    </div>
  );
}
