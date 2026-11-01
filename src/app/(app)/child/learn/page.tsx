import { BookOpenIcon, CalendarCheckIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { requireRole } from "@/features/family/server";
import {
  MissionHero,
  NextStepCard,
  PathDots,
  SkillsStrip,
  topicTitles,
  weeklyRhythmLine,
} from "@/features/learning";
import { getLearningOverview, topics } from "@/features/learning/server";

export const metadata: Metadata = { title: "Learn" };

/**
 * Learn: one hero (the current mission, or whatever comes before it), the seven days as a row of
 * stops, the topics as chips, and the skills the child has so far. One keycap on the screen.
 */
async function LearnContent() {
  const { user } = await requireRole("child", routes.childLearn);
  const overview = await getLearningOverview(user.id);
  const current = overview.journey.find((mission) => mission.status === "current");
  const heroIsMission =
    current && (overview.nextStep.kind === "mission" || overview.nextStep.kind === "resume");
  const hasSkills = overview.skills.some((skill) => skill.level > 0);
  return (
    <>
      <header className="grid gap-2">
        <h1 className="text-balance text-display">Seven days. Small missions.</h1>
        <p className="text-ink-2">{weeklyRhythmLine(overview.daysThisWeek)}</p>
      </header>
      {heroIsMission ? (
        <MissionHero mission={current} />
      ) : (
        <NextStepCard step={overview.nextStep} />
      )}
      <PathDots journey={overview.journey} />
      <Link
        href={routes.childWeek}
        className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-hairline bg-card px-4 py-3 font-semibold hover:bg-muted"
      >
        <span className="flex items-center gap-2">
          <CalendarCheckIcon aria-hidden className="size-5 text-primary" />
          Your week
        </span>
        <ChevronRightIcon aria-hidden className="size-5" />
      </Link>
      <section aria-labelledby="topics-heading" className="grid gap-2">
        <h2 id="topics-heading" className="eyebrow">
          Topics
        </h2>
        <ul className="flex flex-wrap gap-2">
          {topics.map((topic) => (
            <li key={topic.key}>
              <Link
                href={routes.childTopic(topic.key)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline-strong bg-card px-4 font-semibold hover:bg-muted"
              >
                <BookOpenIcon aria-hidden className="size-4 text-primary" />
                {topicTitles[topic.key]}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {hasSkills ? (
        <SkillsStrip skills={overview.skills} showLink={false} />
      ) : (
        <p className="text-center text-ink-2">Your first skill is one mission away.</p>
      )}
    </>
  );
}

function LearnSkeleton() {
  return (
    <div aria-hidden className="grid gap-4">
      <div className="shimmer h-11 w-64 rounded-lg bg-muted" />
      <div className="shimmer h-44 rounded-xl bg-muted" />
      <div className="shimmer h-12 rounded-xl bg-muted" />
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
