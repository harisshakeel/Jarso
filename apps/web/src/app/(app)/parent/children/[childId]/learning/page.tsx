import type { Metadata } from "next";
import { Suspense } from "react";
import { routes } from "@/config";
import { CheckInSummary, CompletedMissions, PathMap, SkillList } from "@/features/learning";
import { getLearningOverview } from "@/features/learning/server";
import { loadChild } from "../load-child";
import { FormSkeleton, PageShell } from "../page-shell";

export const metadata: Metadata = { title: "Learning" };

async function LearningContent({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const { child } = await loadChild(childId, routes.parentChildLearning(childId));
  const overview = await getLearningOverview(childId);
  const days = overview.daysThisWeek;
  return (
    <PageShell
      title={`${child.nickname}'s learning`}
      intro="Learning progress is kept apart from money. It shows understanding, not how much is saved."
      back={{ href: routes.parentChild(childId), label: child.nickname }}
      wide
    >
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="grid gap-6">
          <section
            aria-labelledby="this-week"
            className="grid gap-2 rounded-xl bg-card p-5 shadow-rest"
          >
            <h2 id="this-week" className="text-h3">
              This week
            </h2>
            <p>
              {days === 0
                ? "No learning yet this week."
                : `Learned on ${days} ${days === 1 ? "day" : "days"} this week.`}
            </p>
            <CheckInSummary checkIn={overview.checkIn} />
          </section>
          <CompletedMissions completed={overview.completed} />
          <SkillList progress={overview.skills} heading="Skills" />
        </div>
        <section aria-labelledby="journey-heading" className="grid gap-3">
          <h2 id="journey-heading" className="text-h3">
            The journey
          </h2>
          <PathMap journey={overview.journey} readOnly />
        </section>
      </div>
    </PageShell>
  );
}

export default function ChildLearningPage({
  params,
}: PageProps<"/parent/children/[childId]/learning">) {
  return (
    <Suspense
      fallback={
        <PageShell title="Learning" wide>
          <FormSkeleton />
        </PageShell>
      }
    >
      <LearningContent params={params} />
    </Suspense>
  );
}
