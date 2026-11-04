import {
  type BoardChild,
  type FamilyRoad,
  familyBoardCopy,
  type GoalPlace,
  learningCardCopy,
  standingAt,
} from "@jarso/core/dashboard";
import { FlagIcon, GraduationCapIcon, PlusIcon, TargetIcon, TrophyIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { routes } from "@/config";
import { cn, formatMoney } from "@/lib";
import { seriesOf } from "./series";

/** A child as a small disc in their colour with their first letter. The name is said nearby. */
export function ChildDisc({
  child,
  label,
  className,
}: {
  child: BoardChild;
  label?: string;
  className?: string;
}) {
  const series = seriesOf(child.slot);
  const look = cn(
    "grid size-8 shrink-0 place-items-center rounded-full font-extrabold text-sm uppercase ring-2 ring-card",
    series.dot,
    series.ink,
    className,
  );
  const letter = child.nickname.charAt(0);
  if (!label) {
    return (
      <span aria-hidden className={look}>
        {letter}
      </span>
    );
  }
  return (
    <span role="img" aria-label={label} title={label} className={look}>
      {letter}
    </span>
  );
}

/** At most this many discs stand on one stop; past that, two and a "+N". */
const STACK = 3;

/** A stop's discs, stacked upwards; every stack is as tall as the tallest so the stops line up. */
function Stack({ items, labels, rows }: { items: BoardChild[]; labels: string[]; rows: number }) {
  const over = items.length > STACK;
  const shown = over ? items.slice(0, STACK - 1) : items;
  const more = items.length - shown.length;
  return (
    <span
      className="flex flex-col items-center justify-end [&>*+*]:-mt-2"
      style={{ height: `${2 + (rows - 1) * 1.5}rem` }}
    >
      {more > 0 ? (
        <span className="grid size-8 place-items-center rounded-full bg-muted font-bold text-xs ring-2 ring-card">
          +{more}
        </span>
      ) : null}
      {shown.map((child, index) => (
        <ChildDisc key={child.childId} child={child} label={labels[index]} />
      ))}
    </span>
  );
}

/** A stop on the road: the road runs through it, from the first stop's centre to the flag's. */
function Stop({ first, last, children }: { first: boolean; last: boolean; children: ReactNode }) {
  return (
    <span className="relative flex w-full justify-center">
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 h-2 -translate-y-1/2 bg-muted",
          first ? "left-1/2" : "left-0",
          last ? "right-1/2" : "right-0",
        )}
      />
      {children}
    </span>
  );
}

/**
 * Home's lesson road (2026-11-04): the seven missions left to right, each child standing on the
 * one they're on, the flag at the end for a child who has done them all. Under it, each child's
 * place in words, linked to their Learning tab.
 */
export function FamilyRoadCard({
  road,
  unavailable = [],
}: {
  road: FamilyRoad;
  /** Children whose learning couldn't be read: still named under the road, with a calm line. */
  unavailable?: BoardChild[];
}) {
  const { stops, places } = road;
  if (stops.length === 0 && unavailable.length === 0) return null;
  const finished = standingAt(road, stops.length);
  const rows = Math.min(
    STACK,
    Math.max(1, ...Array.from({ length: stops.length + 1 }, (_, i) => standingAt(road, i).length)),
  );
  return (
    <section
      aria-labelledby="family-road-title"
      className="grid gap-4 rounded-xl bg-card p-5 shadow-rest"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="family-road-title" className="flex items-center gap-2 text-h2">
          <GraduationCapIcon aria-hidden className="size-6 text-primary" />
          {familyBoardCopy.roadTitle}
        </h2>
        <span className="flex flex-wrap items-center gap-x-4">
          <span className="text-ink-2 text-sm">{familyBoardCopy.roadIntro}</span>
          <Link
            href={routes.parentNewChild}
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary text-sm underline-offset-4 hover:underline"
          >
            <PlusIcon aria-hidden className="size-4" />
            {familyBoardCopy.addChild}
          </Link>
        </span>
      </div>
      <ol
        aria-label={familyBoardCopy.roadTitle}
        className="grid items-start"
        style={{ gridTemplateColumns: `repeat(${stops.length + 1}, minmax(0, 1fr))` }}
      >
        {stops.map((stop, index) => {
          const here = standingAt(road, index);
          return (
            <li key={stop.day} className="relative grid justify-items-center gap-2 text-center">
              <Stack
                items={here}
                rows={rows}
                labels={here.map((place) => familyBoardCopy.place(place, stops))}
              />
              <Stop first={index === 0} last={false}>
                <span
                  className={cn(
                    "relative grid size-8 place-items-center rounded-full border-2 font-extrabold text-sm",
                    here.length > 0
                      ? "border-gold bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold"
                      : "border-hairline-strong bg-card text-ink-2",
                  )}
                >
                  <span className="sr-only">Day </span>
                  {stop.day}
                </span>
              </Stop>
              <span className="hidden w-full text-balance px-1 text-ink-2 text-xs leading-tight sm:block">
                {stop.title}
              </span>
            </li>
          );
        })}
        <li className="relative grid justify-items-center gap-2 text-center">
          <Stack
            items={finished}
            rows={rows}
            labels={finished.map((place) => familyBoardCopy.place(place, stops))}
          />
          <Stop first={false} last>
            <span className="relative grid size-8 place-items-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
              <FlagIcon aria-hidden className="size-4" />
              <span className="sr-only">{familyBoardCopy.finished}</span>
            </span>
          </Stop>
          <span className="hidden text-ink-2 text-xs leading-tight sm:block">
            {familyBoardCopy.finished}
          </span>
        </li>
      </ol>
      {/* Each child in a row (2026-11-04, the learning cards folded in): the name opens their
          page on Learning, then where they are, then the newest lesson and how it went. */}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {places.map((place) => (
          <li key={place.childId} className="grid gap-1 rounded-xl bg-muted/60 px-4 py-3">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <ChildDisc child={place} className="size-6 text-xs ring-0" />
              <Link
                href={routes.parentChild(place.childId)}
                className="font-bold underline-offset-4 hover:underline"
              >
                {place.nickname}
              </Link>
              <span className="text-ink-2 text-sm">{familyBoardCopy.where(place, stops)}</span>
            </span>
            <span className="text-sm">
              {place.latest ? (
                <>
                  <span className="font-semibold">{familyBoardCopy.lastLesson}: </span>
                  {learningCardCopy.feedback(place.latest)}
                </>
              ) : (
                <span className="text-ink-2">{familyBoardCopy.noLessons}</span>
              )}
            </span>
          </li>
        ))}
        {unavailable.map((child) => (
          <li key={child.childId} className="grid gap-1 rounded-xl bg-muted/60 px-4 py-3">
            <span className="flex items-center gap-2">
              <ChildDisc child={child} className="size-6 text-xs ring-0" />
              <Link
                href={routes.parentChild(child.childId)}
                className="font-bold underline-offset-4 hover:underline"
              >
                {child.nickname}
              </Link>
            </span>
            <span className="text-ink-2 text-sm">{learningCardCopy.unavailable}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Spread discs that would sit on top of each other: one row up for each close neighbour. */
function rowsFor(places: { childId: string; percent: number }[]): Map<string, number> {
  const rows = new Map<string, number>();
  const placed: { percent: number; row: number }[] = [];
  for (const place of [...places].sort((a, b) => a.percent - b.percent)) {
    let row = 0;
    while (placed.some((p) => p.row === row && Math.abs(p.percent - place.percent) < 9)) row += 1;
    placed.push({ percent: place.percent, row });
    rows.set(place.childId, row);
  }
  return rows;
}

/**
 * Home's goal track (2026-11-04): one line from nothing to the goal, each child with a goal
 * standing at how far they are (Save less money waiting to come out, as on their own goal). Each
 * child's goal is their own; the line only shows how far along, never who is ahead.
 */
export function FamilyGoalsCard({ places, currency }: { places: GoalPlace[]; currency: string }) {
  const withGoal = places.filter(
    (place): place is GoalPlace & { goal: NonNullable<GoalPlace["goal"]> } => place.goal !== null,
  );
  const rows = rowsFor(withGoal.map((p) => ({ childId: p.childId, percent: p.goal.percent })));
  const height = Math.max(0, ...rows.values()) + 1;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <section
      aria-labelledby="family-goals-title"
      className="grid content-start gap-4 rounded-xl bg-card p-5 shadow-rest"
    >
      <div className="grid gap-1">
        <h2 id="family-goals-title" className="flex items-center gap-2 text-h2">
          <TargetIcon aria-hidden className="size-6 text-gold-text" />
          {familyBoardCopy.goalsTitle}
        </h2>
        <p className="text-ink-2 text-sm">{familyBoardCopy.goalsIntro}</p>
      </div>
      {withGoal.length === 0 ? (
        <p className="text-ink-2">{familyBoardCopy.noGoals}</p>
      ) : (
        <div aria-hidden className="px-4">
          <div className="relative" style={{ height: `${height * 1.75 + 2.5}rem` }}>
            <span className="absolute inset-x-0 bottom-3 h-2 rounded-full bg-muted" />
            {[25, 50, 75].map((mark) => (
              <span
                key={mark}
                className="absolute bottom-2 h-4 w-0.5 -translate-x-1/2 rounded-full bg-hairline-strong"
                style={{ left: `${mark}%` }}
              />
            ))}
            <TrophyIcon className="absolute right-0 bottom-0 size-8 translate-x-1/2 fill-gold-100 text-gold-text dark:fill-gold-900" />
            {withGoal.map((place) => (
              <span
                key={place.childId}
                className="absolute -translate-x-1/2 transition-[left] duration-700 ease-[var(--ease-brand)] motion-reduce:transition-none"
                style={{
                  left: `${Math.min(place.goal.percent, 96)}%`,
                  bottom: `${(rows.get(place.childId) ?? 0) * 1.75 + 1.75}rem`,
                }}
              >
                <ChildDisc child={place} />
              </span>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-ink-2 text-xs">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      )}
      <ul className="grid gap-2">
        {places.map((place) => (
          <li
            key={place.childId}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5"
          >
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <ChildDisc child={place} className="size-6 text-xs ring-0" />
              {place.goal ? (
                <span className="truncate">
                  {place.nickname}: <span aria-hidden>{place.goal.emoji}</span> {place.goal.name}
                </span>
              ) : (
                <span className="truncate text-ink-2">
                  {familyBoardCopy.noGoal(place.nickname)}
                </span>
              )}
            </span>
            {place.goal ? (
              <span className="text-ink-2 text-sm">
                {place.goal.reached ? (
                  <span className="font-bold text-gold-text">Reached</span>
                ) : (
                  <>
                    <span className="font-bold text-foreground">{place.goal.percent}%</span>
                    {" · "}
                    <span className="money">
                      {money(place.goal.countedMinor)} of {money(place.goal.targetMinor)}
                    </span>
                  </>
                )}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
