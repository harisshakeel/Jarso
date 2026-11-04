import {
  type ChildLearning,
  dashboardCopy,
  learningCardCopy,
  learningSnapshot,
} from "@jarso/core/dashboard";
import { formatShortDate, summaryLine } from "@jarso/core/learning";
import { FlameIcon, GraduationCapIcon, PlusIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { routes } from "@/config";
import { formatMoney } from "@/lib";
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
 * Home's learning section (2026-11-04): one compact card per child, first on the page. The
 * week in a line, the newest lesson with how it went, and what's next, so a parent sees in a
 * glance how each child is learning. The child's name opens their page, on the Learning tab.
 */
export function HomeLearning({
  items,
  today,
  unavailable = [],
}: {
  items: ChildLearning[];
  today: string;
  /** Children whose learning couldn't be read: still named here, with a calm line. */
  unavailable?: Omit<ChildLearning, "overview">[];
}) {
  return (
    <section aria-labelledby="home-learning-title" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="home-learning-title" className="flex items-center gap-2 text-h2">
          <GraduationCapIcon aria-hidden className="size-6 text-primary" />
          {learningCardCopy.title}
        </h2>
        <Link
          href={routes.parentNewChild}
          className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary text-sm underline-offset-4 hover:underline"
        >
          <PlusIcon aria-hidden className="size-4" />
          {dashboardCopy.addChild}
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((child) => {
          const snap = learningSnapshot(child.overview, today);
          return (
            <li key={child.childId} className="grid gap-2 rounded-xl bg-card p-4 shadow-rest">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ChildName child={child} as="h3" />
                <Chips streak={snap.streak} points={snap.points} />
              </div>
              <p className="text-ink-2">{learningCardCopy.week(snap.daysThisWeek)}</p>
              <p>
                {snap.latest ? (
                  <>
                    <span className="font-semibold">{learningCardCopy.lastLesson}: </span>
                    {learningCardCopy.feedback(snap.latest)}
                  </>
                ) : (
                  learningCardCopy.noLessons
                )}
              </p>
              <p className="text-ink-2 text-sm">{snap.next ?? learningCardCopy.allDone}</p>
            </li>
          );
        })}
        {unavailable.map((child) => (
          <li key={child.childId} className="grid gap-2 rounded-xl bg-card p-4 shadow-rest">
            <ChildName child={child} as="h3" />
            <p className="text-ink-2">{learningCardCopy.unavailable}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The Children page (2026-11-04): one panel per child about learning first. Their week, the
 * next step, skills and practice, the starting check-in, and the last three lessons with how
 * each went; Spend and Save in one line at the foot. `extra` holds the child's own actions
 * (Send a note), passed in so this stays a server component.
 */
export function ChildLearningPanel({
  child,
  today,
  jars,
  currency,
  extra,
}: {
  child: ChildLearning;
  today: string;
  jars: { spend: number; save: number } | null;
  currency: string;
  extra?: ReactNode;
}) {
  const snap = learningSnapshot(child.overview, today);
  const recent = child.overview.completed.slice(0, 3);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <article className="grid gap-4 rounded-xl bg-card p-5 shadow-rest">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChildName child={child} as="h2" />
        <Chips streak={snap.streak} points={snap.points} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground text-sm">This week</dt>
          <dd className="font-semibold">{learningCardCopy.week(snap.daysThisWeek)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Next</dt>
          <dd className="font-semibold">{snap.next ?? learningCardCopy.allDone}</dd>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-hairline border-t pt-3">
        {jars ? (
          <p className="text-ink-2">
            Spend <span className="money font-bold text-foreground">{money(jars.spend)}</span>
            {" · "}Save <span className="money font-bold text-foreground">{money(jars.save)}</span>
          </p>
        ) : (
          <span />
        )}
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
