import { ChevronLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SlowFallback } from "@/components/shell";
import { routes } from "@/config";
import { getFamily, requireRole } from "@/features/family/server";
import { learnCopy, MissionPlayer } from "@/features/learning";
import { checkIn, getLearningOverview } from "@/features/learning/server";

export const metadata: Metadata = { title: "Check-in" };

async function CheckInContent() {
  const { user } = await requireRole("child", routes.childCheckIn);
  const [family, overview] = await Promise.all([getFamily(), getLearningOverview(user.id)]);
  if (!family) notFound();
  if (overview.checkIn) {
    return (
      <section className="grid gap-4 rounded-2xl bg-card p-6 shadow-raised">
        <h1 className="text-h1">{learnCopy.checkIn.doneHeading}</h1>
        <p className="text-ink-2">{learnCopy.checkIn.doneBody}</p>
        <Link
          href={routes.childLearn}
          className="keycap inline-flex h-11 w-fit items-center rounded-full bg-primary px-6 font-bold text-primary-foreground"
        >
          {learnCopy.backToLearn}
        </Link>
      </section>
    );
  }
  return (
    <MissionPlayer
      mode={{ kind: "check-in" }}
      steps={checkIn.questions}
      currency={family.currency}
      userId={user.id}
      intro={{
        eyebrow: learnCopy.checkIn.eyebrow,
        heading: learnCopy.checkIn.heading,
        body: learnCopy.checkIn.body,
      }}
      doneHref={routes.childLearn}
      doneLabel={learnCopy.checkIn.doneLabel}
      film={checkIn.film}
    />
  );
}

export default function CheckInPage() {
  return (
    <div className="mx-auto grid w-full max-w-xl gap-4">
      <Link
        href={routes.childLearn}
        className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-full pr-2 font-semibold text-primary text-sm hover:underline hover:underline-offset-4"
      >
        <ChevronLeftIcon aria-hidden className="size-5" />
        {learnCopy.back}
      </Link>
      <Suspense
        fallback={
          <SlowFallback>
            <div aria-hidden className="shimmer h-80 rounded-2xl bg-muted" />
          </SlowFallback>
        }
      >
        <CheckInContent />
      </Suspense>
    </div>
  );
}
