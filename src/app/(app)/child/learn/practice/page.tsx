import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getFamily, requireRole } from "@/features/family/server";
import { StepGuide } from "@/features/guide";
import { getGuideState } from "@/features/guide/server";
import { MissionPlayer } from "@/features/learning";
import { getPracticeSet } from "@/features/learning/server";

// The guide action runs on this page: allow a full guide turn (45 s) plus saving it.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Practice" };

async function PracticeContent() {
  const { user } = await requireRole("child", routes.childPractice);
  const [family, items, guide] = await Promise.all([
    getFamily(),
    getPracticeSet(),
    getGuideState(user.id),
  ]);
  if (!family) notFound();
  if (items.length === 0) {
    return (
      <section className="grid gap-4 rounded-2xl bg-card p-6 shadow-raised">
        <h1 className="text-h1">All caught up.</h1>
        <p className="text-ink-2">
          Nothing to practise right now. Skills come back here a day or more after a mission.
        </p>
        <Link
          href={routes.childLearn}
          className="keycap inline-flex h-11 w-fit items-center rounded-full bg-primary px-6 font-bold text-primary-foreground"
        >
          Back to Learn
        </Link>
      </section>
    );
  }
  return (
    <>
      <header className="grid gap-1">
        <p className="eyebrow">Practice</p>
        <h1 className="text-h1">Quick review. New examples.</h1>
      </header>
      <MissionPlayer
        mode={{ kind: "practice" }}
        steps={items}
        currency={family.currency}
        userId={user.id}
        doneHref={routes.childLearn}
        doneLabel="Back to Learn"
        stepAside={guide.available ? <StepGuide introNeeded={guide.introNeeded} /> : undefined}
      />
    </>
  );
}

export default function PracticePage() {
  return (
    <div className="mx-auto grid w-full max-w-xl gap-4">
      <Link
        href={routes.childLearn}
        className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-full pr-2 font-semibold text-primary text-sm hover:underline hover:underline-offset-4"
      >
        <ChevronLeftIcon aria-hidden className="size-5" />
        Learn
      </Link>
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-80 rounded-2xl bg-muted" />
          </SlowFallback>
        }
      >
        <PracticeContent />
      </Suspense>
    </div>
  );
}
