import { ChevronRightIcon, GraduationCapIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { summaryLine } from "../journey";
import { formatShortDate } from "../text";
import type { LearningOverview } from "../types";

/** The parent's card on a child's page: missions done and learning days, linking to the detail. */
export function LearningSummaryCard({
  overview,
  nickname,
  href,
}: {
  overview: LearningOverview;
  nickname: string;
  href: Route;
}) {
  const done = overview.journey.filter((m) => m.status === "done").length;
  const days = overview.daysThisWeek;
  return (
    <Card>
      <CardContent>
        <section aria-labelledby="learning-summary" className="grid gap-2">
          <h2 id="learning-summary" className="flex items-center gap-2 text-h3">
            <GraduationCapIcon aria-hidden className="size-5" />
            Learning
          </h2>
          <p>
            {done} of {overview.journey.length} missions done.{" "}
            {days === 0
              ? `${nickname} hasn't learned yet this week.`
              : `Learned on ${days} ${days === 1 ? "day" : "days"} this week.`}
          </p>
          <Link
            href={href}
            className="inline-flex min-h-11 w-fit items-center gap-1 rounded-full font-semibold text-primary underline-offset-4 hover:underline"
          >
            See learning progress
            <ChevronRightIcon aria-hidden className="size-5" />
          </Link>
        </section>
      </CardContent>
    </Card>
  );
}

/** Finished missions, newest first, with how they went. */
export function CompletedMissions({ completed }: { completed: LearningOverview["completed"] }) {
  return (
    <section aria-labelledby="completed-missions" className="grid gap-3">
      <h2 id="completed-missions" className="text-h3">
        Missions done
      </h2>
      {completed.length === 0 ? (
        <p className="text-ink-2">No missions finished yet.</p>
      ) : (
        <ul className="grid gap-2">
          {completed.map((mission) => (
            <li
              key={mission.attemptId}
              className="grid gap-0.5 rounded-xl border border-hairline bg-card px-4 py-3"
            >
              <span className="font-semibold">{mission.title}</span>
              <span className="text-ink-2 text-sm">
                {formatShortDate(mission.completedOn)} · {summaryLine(mission)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The starting check-in result, in words. */
export function CheckInSummary({ checkIn }: { checkIn: LearningOverview["checkIn"] }) {
  return (
    <p className="text-ink-2">
      {checkIn
        ? `Starting check-in: ${checkIn.correctCount} of 5 known already.`
        : "The starting check-in isn't done yet."}
    </p>
  );
}
