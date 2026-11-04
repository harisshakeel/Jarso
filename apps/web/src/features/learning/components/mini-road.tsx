import type { JourneyMission } from "@jarso/core/learning";
import { CheckIcon, FlagIcon } from "lucide-react";
import Link from "next/link";
import { JarsoMark } from "@/components/brand";
import { routes } from "@/config";
import { cn } from "@/lib";

/** "Mission 2 of 7", or that every mission is done. */
export function roadLine(journey: JourneyMission[]): string {
  const current = journey.findIndex((mission) => mission.status === "current");
  if (current < 0) return `All ${journey.length} missions done`;
  return `Mission ${current + 1} of ${journey.length}`;
}

/**
 * The seven missions as one short line on Home (2026-11-04): done stops teal, the one you're on
 * gold with the jar parked above it, the rest waiting, the flag at the end. Little detail on
 * purpose; the full road is on Learn, and the line links there.
 */
export function MiniRoad({ journey }: { journey: JourneyMission[] }) {
  if (journey.length === 0) return null;
  const current = journey.findIndex((mission) => mission.status === "current");
  const done = journey.filter((mission) => mission.status === "done").length;
  const finished = current < 0;
  const title = finished ? null : journey[current]?.title;
  return (
    <Link
      href={routes.childLearn}
      className="grid content-center gap-3 rounded-2xl p-2 transition-colors hover:bg-muted/60"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-bold">{roadLine(journey)}</span>
        {title ? <span className="truncate text-ink-2 text-sm">{title}</span> : null}
      </span>
      <span className="sr-only">
        {done} of {journey.length} done. Open your road.
      </span>
      <ol aria-hidden className="flex items-end">
        {journey.map((mission, index) => {
          const isDone = mission.status === "done";
          const isCurrent = mission.status === "current";
          return (
            <li key={mission.key} className="relative flex flex-1 flex-col items-center gap-1">
              <span className="grid h-8 place-items-end">
                {isCurrent ? (
                  <JarsoMark
                    size={28}
                    className="motion-safe:animate-[coin-bob_2.4s_ease-in-out_infinite]"
                  />
                ) : null}
              </span>
              <span className="relative flex w-full justify-center">
                <span
                  className={cn(
                    "absolute top-1/2 right-0 h-1.5 -translate-y-1/2",
                    index === 0 ? "left-1/2" : "left-0",
                    index < done ? "bg-primary" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "relative grid place-items-center rounded-full font-extrabold",
                    isCurrent
                      ? "size-9 border-4 border-gold bg-gold-100 text-gold-700 text-sm dark:bg-gold-900 dark:text-gold"
                      : "size-6 border-2 text-xs",
                    isDone && "border-primary bg-primary text-primary-foreground",
                    !isDone && !isCurrent && "border-hairline-strong bg-card text-muted-foreground",
                  )}
                >
                  {isDone ? <CheckIcon className="size-3.5" /> : mission.day}
                </span>
              </span>
            </li>
          );
        })}
        <li className="relative flex flex-col items-center gap-1">
          <span className="grid h-8 place-items-end">
            {finished ? <JarsoMark size={28} /> : null}
          </span>
          <span className="relative flex justify-center">
            <span
              className={cn(
                "absolute top-1/2 right-1/2 left-0 h-1.5 -translate-y-1/2",
                finished ? "bg-primary" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "relative grid size-7 place-items-center rounded-full border-2",
                finished
                  ? "border-gold bg-gold text-gold-foreground"
                  : "border-hairline-strong bg-card text-muted-foreground",
              )}
            >
              <FlagIcon className="size-3.5" />
            </span>
          </span>
        </li>
      </ol>
    </Link>
  );
}
