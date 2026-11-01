import { CheckIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { routes } from "@/config";
import { cn } from "@/lib";
import type { JourneyMission } from "../types";

/**
 * The seven-day journey as a row of seven stops: done ones are teal with a check, the current
 * one is the gold ring, the rest are locked. Each stop names its mission for screen readers; done
 * missions open again from here. The current mission's details live in the hero above.
 */
export function PathDots({ journey }: { journey: JourneyMission[] }) {
  const anyLocked = journey.some((mission) => mission.status === "locked");
  return (
    <section aria-labelledby="path-heading" className="grid gap-2">
      <h2 id="path-heading" className="eyebrow">
        Your seven days
      </h2>
      <ol aria-label="Your seven-day journey" className="flex items-center justify-between gap-1">
        {journey.map((mission, index) => {
          const done = mission.status === "done";
          const current = mission.status === "current";
          const name = `Day ${mission.day} · ${mission.title}`;
          const dot = (
            <span
              className={cn(
                "grid size-10 place-items-center rounded-full border-2 font-bold",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-gold bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold",
                !done && !current && "border-hairline-strong bg-muted text-muted-foreground",
              )}
            >
              {done ? (
                <CheckIcon aria-hidden className="size-5" />
              ) : current ? (
                <span aria-hidden>{mission.day}</span>
              ) : (
                <LockIcon aria-hidden className="size-4" />
              )}
            </span>
          );
          return (
            <li key={mission.key} className="flex flex-1 items-center">
              {done || current ? (
                <Link
                  href={routes.childMission(mission.key)}
                  aria-label={name}
                  aria-current={current ? "step" : undefined}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-card"
                >
                  {dot}
                </Link>
              ) : (
                <span className="inline-flex min-h-11 min-w-11 items-center justify-center">
                  {dot}
                  <span className="sr-only">{name}, locked</span>
                </span>
              )}
              {index < journey.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "h-0.5 flex-1 rounded-full",
                    done ? "bg-primary" : "bg-hairline-strong",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {anyLocked ? <p className="text-ink-2">Unlocks after the mission before it.</p> : null}
    </section>
  );
}
