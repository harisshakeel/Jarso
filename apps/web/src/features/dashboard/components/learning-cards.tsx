import { type ChildLearning, learningCardCopy, learningSnapshot } from "@jarso/core/dashboard";
import { formatShortDate, summaryLine } from "@jarso/core/learning";
import { FlameIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { routes } from "@/config";
import { SeriesDot } from "./series";

/** The child's name, headed and linked, in their colour: one per child on a page. */
function ChildName({
  child,
  as: Heading,
}: {
  child: Omit<ChildLearning, "overview">;
  as: "h2" | "h3";
}) {
  return (
    <Heading className="flex min-w-0 items-center gap-2 text-h3">
      <SeriesDot slot={child.slot} />
      <Link
        href={routes.parentChild(child.childId)}
        className="truncate underline-offset-4 hover:underline"
      >
        {child.nickname}
      </Link>
    </Heading>
  );
}

/** Streak and points as two small chips, the streak only from two days in a row. */
function Chips({ streak, points }: { streak: number; points: number }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm">
      {streak >= 2 ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold">
          <FlameIcon aria-hidden className="size-3.5 text-accent-text" />
          {learningCardCopy.streak(streak)}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold">
        <StarIcon aria-hidden className="size-3.5 fill-gold text-gold-text" />
        {learningCardCopy.points(points)}
      </span>
    </span>
  );
}

/**
 * The Children page (2026-11-04): one panel per child about learning. Their week, skills and
 * practice or the starting check-in, and the last three lessons with how each went. Where they
 * are on the road and their money are on Home. `extra` holds the child's own actions (Send a
 * note), passed in so this stays a server component.
 */
export function ChildLearningPanel({
  child,
  today,
  extra,
}: {
  child: ChildLearning;
  today: string;
  extra?: ReactNode;
}) {
  const snap = learningSnapshot(child.overview, today);
  const recent = child.overview.completed.slice(0, 3);
  return (
    <article className="grid gap-4 rounded-xl bg-card p-5 shadow-rest">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChildName child={child} as="h2" />
        <Chips streak={snap.streak} points={snap.points} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-sm">This week</dt>
          <dd className="font-semibold">{learningCardCopy.week(snap.daysThisWeek)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Skills</dt>
          <dd className="font-semibold">
            {learningCardCopy.skills(snap.skillsLearned, snap.skillsTotal)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Practice</dt>
          <dd className="font-semibold">
            {snap.practiceDue > 0
              ? learningCardCopy.practice(snap.practiceDue)
              : snap.checkInDone
                ? learningCardCopy.checkInDone
                : "Starting check-in not done yet"}
          </dd>
        </div>
      </dl>
      <section aria-label={`${child.nickname}: ${learningCardCopy.recent}`} className="grid gap-2">
        <h3 className="font-bold">{learningCardCopy.recent}</h3>
        {recent.length === 0 ? (
          <p className="text-ink-2">{learningCardCopy.noLessons}</p>
        ) : (
          <ul className="grid gap-2">
            {recent.map((mission) => (
              <li
                key={mission.attemptId}
                className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-muted/60 px-3 py-2"
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
      <div className="flex flex-wrap items-center justify-end gap-3 border-hairline border-t pt-3">
        <div className="flex flex-wrap items-center gap-x-4">
          {extra}
          <Link
            href={routes.parentChild(child.childId)}
            className="inline-flex min-h-11 items-center font-semibold text-primary text-sm underline-offset-4 hover:underline"
          >
            {learningCardCopy.seeLearning} <span className="sr-only">for {child.nickname}</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
