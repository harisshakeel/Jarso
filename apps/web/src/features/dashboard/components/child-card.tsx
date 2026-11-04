import {
  type BoardChild,
  boardKid,
  childCardCopy,
  familyRoad,
  type GoalPlace,
  learningCardCopy,
  learningSnapshot,
  roadStatus,
} from "@jarso/core/dashboard";
import { formatShortDate, type LearningOverview, summaryLine } from "@jarso/core/learning";
import type { Jars } from "@jarso/core/ledger";
import {
  ArrowRightIcon,
  CheckIcon,
  FlameIcon,
  GraduationCapIcon,
  StarIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CoachFigure } from "@/components/brand";
import { routes } from "@/config";
import { cn, formatMoney } from "@/lib";
import { seriesOf } from "./series";

type ChildCardProps = {
  child: BoardChild;
  /** Their learning, or null when it couldn't be read. */
  learning: LearningOverview | null;
  /** Their Spend and Save, or null when they couldn't be read. */
  jars: Jars | null;
  goal: GoalPlace["goal"];
  /** Family-local date, `YYYY-MM-DD`. */
  today: string;
  currency: string;
  /** The allowance block (from the allowance feature), passed in so this stays a leaf. */
  allowance: ReactNode;
  /** The child's own actions (Send a note). */
  actions?: ReactNode;
};

/** The seven missions as a short bar: done teal, the one they're on gold, the rest waiting. */
function RoadBar({ overview }: { overview: LearningOverview }) {
  return (
    <ol aria-hidden className="flex gap-1">
      {overview.journey.map((mission) => (
        <li
          key={mission.key}
          className={cn(
            "h-2.5 flex-1 rounded-full",
            mission.status === "done" && "bg-primary",
            mission.status === "current" && "bg-gold",
            mission.status !== "done" && mission.status !== "current" && "bg-muted",
          )}
        />
      ))}
    </ol>
  );
}

function Learning({
  child,
  overview,
  today,
}: {
  child: BoardChild;
  overview: LearningOverview;
  today: string;
}) {
  const snap = learningSnapshot(overview, today);
  const road = familyRoad([{ ...child, overview }]);
  const place = road.places[0];
  const recent = overview.completed.slice(0, 3);
  const practice =
    snap.practiceDue > 0
      ? learningCardCopy.practice(snap.practiceDue)
      : snap.checkInDone
        ? learningCardCopy.checkInDone
        : "Starting check-in not done yet";
  return (
    <section aria-labelledby={`learning-${child.childId}`} className="grid gap-3">
      <h3 id={`learning-${child.childId}`} className="flex items-center gap-2 font-bold">
        <GraduationCapIcon aria-hidden className="size-5 text-primary" />
        {childCardCopy.learning}
      </h3>
      {place ? (
        <div className="grid gap-2">
          <p className="font-semibold">{roadStatus(place, road.stops)}</p>
          <RoadBar overview={overview} />
        </div>
      ) : null}
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { term: "This week", value: learningCardCopy.week(snap.daysThisWeek) },
          { term: "Skills", value: learningCardCopy.skills(snap.skillsLearned, snap.skillsTotal) },
          { term: "Practice", value: practice },
        ].map((item) => (
          <div
            key={item.term}
            className="grid content-start gap-0.5 rounded-lg bg-muted/60 px-2 py-2.5"
          >
            <dt className="text-muted-foreground text-xs">{item.term}</dt>
            <dd className="font-semibold text-sm leading-snug">{item.value}</dd>
          </div>
        ))}
      </dl>
      <section aria-label={`${child.nickname}: ${learningCardCopy.recent}`} className="grid gap-2">
        <h4 className="font-semibold text-ink-2 text-sm">{learningCardCopy.recent}</h4>
        {recent.length === 0 ? (
          <p className="text-ink-2 text-sm">{learningCardCopy.noLessons}</p>
        ) : (
          <ul className="grid gap-1.5">
            {recent.map((mission) => (
              <li
                key={mission.attemptId}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm"
              >
                <span className="flex items-center gap-2 font-semibold">
                  <CheckIcon aria-hidden className="size-4 text-primary" />
                  {mission.title}
                </span>
                <span className="text-ink-2">
                  {formatShortDate(mission.completedOn)} · {summaryLine(mission)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function Money({
  child,
  jars,
  goal,
  currency,
  allowance,
}: Pick<ChildCardProps, "child" | "jars" | "goal" | "currency" | "allowance">) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <section aria-labelledby={`money-${child.childId}`} className="grid gap-3">
      <h3 id={`money-${child.childId}`} className="flex items-center gap-2 font-bold">
        <WalletIcon aria-hidden className="size-5 text-primary" />
        {childCardCopy.money}
      </h3>
      {jars ? (
        <dl className="grid grid-cols-2 gap-2">
          {(["spend", "save"] as const).map((jar) => (
            <div key={jar} className="grid gap-0.5 rounded-lg bg-muted/60 px-3 py-2.5">
              <dt className="text-muted-foreground text-xs">
                {jar === "spend" ? childCardCopy.spend : childCardCopy.save}
              </dt>
              <dd className="money font-extrabold text-xl">{money(jars[jar])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-ink-2 text-sm">{childCardCopy.jarsUnavailable}</p>
      )}
      <div className="grid gap-1.5">
        {goal ? (
          <>
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-semibold">
                {childCardCopy.goal}: <span aria-hidden>{goal.emoji}</span> {goal.name}
              </span>
              <span className="text-ink-2">
                {goal.reached ? (
                  <span className="font-bold text-gold-text">{childCardCopy.reached}</span>
                ) : (
                  <>
                    <span className="money">
                      {money(goal.countedMinor)} of {money(goal.targetMinor)}
                    </span>
                    {" · "}
                    <span className="font-bold text-foreground">{goal.percent}%</span>
                  </>
                )}
              </span>
            </p>
            <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-gold"
                style={{ width: `${goal.percent}%` }}
              />
            </span>
          </>
        ) : (
          <p className="text-ink-2 text-sm">{childCardCopy.noGoal}</p>
        )}
      </div>
      {allowance}
    </section>
  );
}

/**
 * One child on Children (2026-11-05): their kid and name with their run and points, then two
 * headed parts kept apart, Learning (where they are on the seven missions, the week, skills,
 * practice, recent lessons) and Money (Spend, Save, the goal, the allowance with Manage).
 * Learning and money never share a line (invariant 11): points are never money.
 */
export function ChildCard({
  child,
  learning,
  jars,
  goal,
  today,
  currency,
  allowance,
  actions,
}: ChildCardProps) {
  const streak = learning?.streak ?? 0;
  return (
    <article className="grid gap-5 rounded-xl bg-card p-5 shadow-rest">
      <header className="flex flex-wrap items-center gap-4">
        <span
          aria-hidden
          className={cn(
            "grid size-16 shrink-0 place-items-end justify-center overflow-hidden rounded-2xl bg-muted ring-2",
            seriesOf(child.slot).ring,
          )}
        >
          <CoachFigure coach={boardKid(child.slot)} size={60} className="-mb-1" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="truncate text-h3">
            <Link
              href={routes.parentChild(child.childId)}
              className="underline-offset-4 hover:underline"
            >
              {child.nickname}
            </Link>
          </h2>
          {learning ? (
            <span className="flex flex-wrap items-center gap-1.5 text-sm">
              {streak >= 2 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold">
                  <FlameIcon aria-hidden className="size-3.5 text-accent-text" />
                  {learningCardCopy.streak(streak)}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold">
                <StarIcon aria-hidden className="size-3.5 fill-gold text-gold-text" />
                {learningCardCopy.points(learning.points)}
              </span>
            </span>
          ) : null}
        </div>
      </header>
      {learning ? (
        <Learning child={child} overview={learning} today={today} />
      ) : (
        <p className="text-ink-2">{learningCardCopy.unavailable}</p>
      )}
      <div className="border-hairline border-t" />
      <Money child={child} jars={jars} goal={goal} currency={currency} allowance={allowance} />
      <footer className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-hairline border-t pt-3">
        {actions}
        <Link
          href={routes.parentChild(child.childId)}
          className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary text-sm underline-offset-4 hover:underline"
        >
          {learningCardCopy.seeLearning} <span className="sr-only">for {child.nickname}</span>
          <ArrowRightIcon aria-hidden className="size-4" />
        </Link>
      </footer>
    </article>
  );
}
