"use client";

import { type JourneyMission, roadmapCopy } from "@jarso/core/learning";
import { CheckIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { JarsoMark } from "@/components/brand";
import { routes } from "@/config";
import { cn } from "@/lib";

/** The road's drawing box; stops sit on an S-curve from the bottom (day 1) to the top (day 7). */
const WIDTH = 400;
const STEP = 104;
const TOP = 64;
const bottomOf = (count: number) => TOP + (count - 1) * STEP + 64;

type Stop = { mission: JourneyMission; x: number; y: number };

/** Day 1 at the bottom, then left and right on the way up, like a level map. */
export function roadStops(journey: JourneyMission[]): Stop[] {
  const count = journey.length;
  return journey.map((mission, index) => ({
    mission,
    x: index % 2 === 0 ? WIDTH * 0.28 : WIDTH * 0.72,
    y: TOP + (count - 1 - index) * STEP,
  }));
}

/** A smooth road through the stops, as an SVG path. */
export function roadPath(stops: Stop[]): string {
  if (stops.length === 0) return "";
  const [first, ...rest] = stops;
  if (!first) return "";
  let d = `M${first.x} ${first.y}`;
  let previous = first;
  for (const stop of rest) {
    const midY = (previous.y + stop.y) / 2;
    d += ` C${previous.x} ${midY}, ${stop.x} ${midY}, ${stop.x} ${stop.y}`;
    previous = stop;
  }
  return d;
}

/**
 * The seven-day journey as a winding road (FR12): done stops are teal, the current stop is gold
 * with the jar parked on it, the rest are locked. The jar drives from the last done stop to the
 * current one when the page opens, so finishing a mission is seen as moving on.
 */
export function Roadmap({ journey }: { journey: JourneyMission[] }) {
  const stops = roadStops(journey);
  const height = bottomOf(Math.max(journey.length, 1));
  const currentIndex = journey.findIndex((mission) => mission.status === "current");
  const doneCount = journey.filter((mission) => mission.status === "done").length;
  // Where the jar is: the current stop, or the last stop when the journey is done.
  const target = currentIndex >= 0 ? currentIndex : Math.max(journey.length - 1, 0);
  const from = Math.max(target - 1, 0);
  const [at, setAt] = useState(doneCount > 0 ? from : target);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setAt(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);
  const jar = stops[at] ?? stops[0];
  const anyLocked = journey.some((mission) => mission.status === "locked");
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;

  return (
    <section aria-labelledby="road-heading" data-tour="learn" className="grid gap-3">
      <h2 id="road-heading" className="sr-only">
        {roadmapCopy.heading}
      </h2>
      <div className="mx-auto grid w-full max-w-md gap-1.5">
        <p className="flex items-baseline justify-between font-bold">
          <span>
            {doneCount} of {journey.length} missions done
          </span>
          <span className="text-ink-2 text-sm">{roadmapCopy.heading}</span>
        </p>
        <span aria-hidden className="h-2.5 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary transition-[width] duration-700 ease-[var(--ease-brand)] motion-reduce:transition-none"
            style={{ width: pct(doneCount, Math.max(journey.length, 1)) }}
          />
        </span>
      </div>
      <div
        className={cn(
          "relative mx-auto w-full max-w-md",
          // From 1024 px the road is sized by the screen's height (page padding, the progress
          // bar and the line under it taken off), so the whole week fits without a scroll.
          "lg:h-[clamp(28rem,calc(100dvh-11rem),52rem)] lg:w-auto lg:max-w-none",
        )}
        style={{ aspectRatio: `${WIDTH} / ${height}` }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="absolute inset-0 size-full overflow-visible"
        >
          {/* The road's kerb: a slightly wider, darker line under it gives the road an edge. */}
          <path
            d={roadPath(stops)}
            fill="none"
            strokeWidth="44"
            strokeLinecap="round"
            className="stroke-hairline"
          />
          <path
            d={roadPath(stops)}
            fill="none"
            strokeWidth="34"
            strokeLinecap="round"
            className="stroke-muted"
          />
          <path
            d={roadPath(stops)}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="10 14"
            className="stroke-hairline-strong"
          />
          {doneCount > 0 ? (
            <path
              d={roadPath(stops.slice(0, Math.min(doneCount + 1, stops.length)))}
              fill="none"
              strokeWidth="34"
              strokeLinecap="round"
              className="stroke-teal-100 dark:stroke-teal-900"
            />
          ) : null}
        </svg>
        <ol aria-label={roadmapCopy.heading} className="absolute inset-0">
          {stops.map(({ mission, x, y }) => {
            const done = mission.status === "done";
            const current = mission.status === "current";
            const name = roadmapCopy.stopName(mission.day, mission.title);
            const dot = (
              <span className="relative grid place-items-center">
                {current ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-gold/40 motion-safe:animate-ping motion-reduce:hidden"
                  />
                ) : null}
                <span
                  className={cn(
                    "grid size-14 place-items-center rounded-full border-4 font-extrabold text-lg shadow-raised",
                    done && "border-primary bg-primary text-primary-foreground",
                    current &&
                      "border-gold bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold",
                    !done && !current && "border-hairline-strong bg-card text-muted-foreground",
                  )}
                >
                  {done ? (
                    <CheckIcon aria-hidden className="size-7" />
                  ) : current ? (
                    <span aria-hidden>{mission.day}</span>
                  ) : (
                    <LockIcon aria-hidden className="size-5" />
                  )}
                </span>
              </span>
            );
            const label = (
              <span
                className={cn(
                  "absolute top-1/2 w-40 -translate-y-1/2 text-balance rounded-xl px-3 py-2 font-semibold leading-tight shadow-rest ring-1",
                  x < WIDTH / 2
                    ? "left-[calc(100%+0.75rem)]"
                    : "right-[calc(100%+0.75rem)] text-right",
                  done && "bg-card ring-hairline",
                  current && "bg-gold-100 text-foreground ring-gold dark:bg-gold-900",
                  !done && !current && "bg-card/70 text-muted-foreground ring-hairline",
                )}
              >
                <span
                  className={cn(
                    "block text-sm",
                    current ? "font-bold text-gold-700 dark:text-gold" : "text-ink-2",
                  )}
                >
                  {roadmapCopy.day(mission.day)}
                  {done ? " · Done" : current ? " · Play now" : ""}
                </span>
                {mission.title}
              </span>
            );
            return (
              <li
                key={mission.key}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: pct(x, WIDTH), top: pct(y, height) }}
              >
                {done || current ? (
                  <Link
                    href={routes.childMission(mission.key)}
                    aria-label={name}
                    aria-current={current ? "step" : undefined}
                    className="relative block rounded-full transition-transform hover:scale-105 focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-4"
                  >
                    {dot}
                    {label}
                  </Link>
                ) : (
                  <span className="relative block rounded-full">
                    {dot}
                    {label}
                    <span className="sr-only">{roadmapCopy.locked(name)}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {jar ? (
          <div
            aria-hidden
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+1.5rem)] transition-[left,top] duration-700 ease-[var(--ease-brand)] motion-reduce:transition-none"
            style={{ left: pct(jar.x, WIDTH), top: pct(jar.y, height) }}
          >
            <JarsoMark
              size={48}
              className="drop-shadow-md motion-safe:animate-[coin-bob_2.4s_ease-in-out_infinite]"
            />
          </div>
        ) : null}
      </div>
      {currentIndex >= 0 ? (
        <p className="text-center text-ink-2">
          {roadmapCopy.tapGold(journey[currentIndex]?.day)}
          {anyLocked ? roadmapCopy.unlocksAfter : ""}
        </p>
      ) : (
        <p className="text-center text-ink-2">{roadmapCopy.journeyDone}</p>
      )}
    </section>
  );
}
