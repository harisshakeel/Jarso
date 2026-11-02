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
import { getWeeklyReview } from "@/features/review/server";

// The guide action runs on this page: allow a full guide turn (45 s) plus saving it.
export const maxDuration = 60;

export const metadata: Metadata = { title: "One fresh question" };

/** The weekly review's fresh question (FR11): one review-pool item, played like practice. */
async function QuestionContent() {
  const { user } = await requireRole("child", routes.childWeekQuestion);
  const [family, review, guide] = await Promise.all([
    getFamily(),
    getWeeklyReview(user.id),
    getGuideState(user.id),
  ]);
  if (!family) notFound();
  if (!review.question) {
    return (
      <section className="grid gap-4 rounded-2xl bg-card p-6 shadow-raised">
        <h1 className="text-h1">Nothing to ask yet.</h1>
        <p className="text-ink-2">A fresh question comes once you've learned a skill.</p>
        <Link
          href={routes.childWeek}
          className="keycap inline-flex h-11 w-fit items-center rounded-full bg-primary px-6 font-bold text-primary-foreground"
        >
          Back to your week
        </Link>
      </section>
    );
  }
  return (
    <>
      <header className="grid gap-1">
        <p className="eyebrow">Your week</p>
        <h1 className="text-h1">One fresh question.</h1>
      </header>
      <MissionPlayer
        mode={{ kind: "practice" }}
        steps={[review.question]}
        currency={family.currency}
        userId={user.id}
        doneHref={routes.childWeek}
        doneLabel="Back to your week"
        stepAside={guide.available ? <StepGuide introNeeded={guide.introNeeded} /> : undefined}
      />
    </>
  );
}

export default function WeekQuestionPage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-72 rounded-xl bg-muted" />
          </SlowFallback>
        }
      >
        <QuestionContent />
      </Suspense>
    </div>
  );
}
