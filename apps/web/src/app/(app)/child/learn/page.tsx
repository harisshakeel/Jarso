import type { Metadata } from "next";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { requireRole } from "@/features/family/server";
import { learnCopy, NextStepCard, PersonalBests, Roadmap, StreakBadge } from "@/features/learning";
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
        <h1 className="text-balance text-h1">{learnCopy.heading}</h1>
        <StreakBadge points={overview.points} streak={overview.streak} layout="row" />
        {cardFirst ? <NextStepCard step={overview.nextStep} /> : null}
        <PersonalBests overview={overview} />
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
