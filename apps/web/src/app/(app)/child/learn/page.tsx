import { CalendarCheckIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CoachSays } from "@/components/brand";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { requireRole } from "@/features/family/server";
import {
  learnCopy,
  NextStepCard,
  PersonalBests,
  Roadmap,
  ScoreStrip,
  weeklyRhythmLine,
} from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";

export const metadata: Metadata = { title: "Learn" };

/**
 * Learn is the road: seven stops winding up the page, the jar parked on the current one. Whatever
 * comes before a mission (the check-in, a practice, a comeback question) is the one card beside it.
 */
async function LearnContent() {
  const { user } = await requireRole("child", routes.childLearn);
  const overview = await getLearningOverview(user.id);
  const cardFirst = overview.nextStep.kind !== "mission" && overview.nextStep.kind !== "resume";
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_3fr] lg:items-start">
      <div className="grid gap-6 lg:sticky lg:top-20">
        <header className="grid gap-2">
          <h1 className="text-balance text-h1">{learnCopy.heading}</h1>
          <p className="text-ink-2">{weeklyRhythmLine(overview.daysThisWeek)}</p>
          <ScoreStrip points={overview.points} streak={overview.streak} />
        </header>
        <CoachSays coach={{ key: "learn" }} says={{ moment: "learn" }} />
        {cardFirst ? <NextStepCard step={overview.nextStep} /> : null}
        <PersonalBests overview={overview} />
        <Link
          href={routes.childWeek}
          className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-hairline bg-card px-4 py-3 font-semibold hover:bg-muted"
        >
          <span className="flex items-center gap-2">
            <CalendarCheckIcon aria-hidden className="size-5 text-primary" />
            {learnCopy.yourWeek}
          </span>
          <ChevronRightIcon aria-hidden className="size-5" />
        </Link>
      </div>
      <Roadmap journey={overview.journey} />
    </div>
  );
}

function LearnSkeleton() {
  return (
    <div aria-hidden className="grid gap-4">
      <div className="shimmer h-11 w-64 rounded-lg bg-muted" />
      <div className="shimmer h-[32rem] rounded-xl bg-muted" />
    </div>
  );
}

export default function LearnPage() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
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
