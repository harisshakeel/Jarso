import { CheckIcon, LockIcon, PlayIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { routes } from "@/config";
import { cn } from "@/lib";
import { topicTitles } from "../skills";
import { formatShortDate } from "../text";
import type { JourneyMission } from "../types";

/**
 * The seven-day journey as a vertical path: done, the current mission, then locked ones.
 * `readOnly` is the parent's view: the same path, without links into the child's screens.
 */
export function PathMap({
  journey,
  readOnly = false,
}: {
  journey: JourneyMission[];
  readOnly?: boolean;
}) {
  return (
    <ol aria-label="Your seven-day journey" className="relative grid gap-3">
      {journey.map((mission, index) => {
        const done = mission.status === "done";
        const current = mission.status === "current";
        const locked = mission.status === "locked";
        const body = (
          <>
            <span
              aria-hidden
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-full border-2",
                done && "border-primary bg-primary text-primary-foreground",
                current && "border-gold bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold",
                locked && "border-hairline-strong bg-muted text-muted-foreground",
              )}
            >
              {done ? (
                <CheckIcon className="size-6" />
              ) : current ? (
                <PlayIcon className="size-6" />
              ) : (
                <LockIcon className="size-5" />
              )}
            </span>
            <span className="grid gap-0.5">
              <span className="eyebrow">
                Day {mission.day} · {topicTitles[mission.topic]}
              </span>
              <span className="font-bold text-lg">{mission.title}</span>
              <span className="text-ink-2 text-sm">
                {done
                  ? readOnly
                    ? `Done${mission.completedOn ? ` on ${formatShortDate(mission.completedOn)}` : ""}.`
                    : "Done. You can play it again."
                  : current
                    ? mission.inProgress
                      ? readOnly
                        ? "Started, not finished yet."
                        : "Started. Pick up where you left off."
                      : mission.summary
                    : "Unlocks after the mission before it."}
              </span>
            </span>
          </>
        );
        return (
          <li
            key={mission.key}
            style={{ "--rise-index": index } as CSSProperties}
            className="rise-in"
          >
            {locked || readOnly ? (
              <div
                className={cn(
                  "flex items-center gap-4 rounded-xl border bg-card p-4",
                  locked
                    ? "border-hairline opacity-80"
                    : current
                      ? "border-gold"
                      : "border-hairline",
                )}
              >
                {body}
                {locked ? <span className="sr-only">Locked</span> : null}
              </div>
            ) : (
              <Link
                href={routes.childMission(mission.key)}
                className={cn(
                  "flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:bg-muted",
                  current ? "border-gold shadow-raised" : "border-hairline",
                )}
                aria-current={current ? "step" : undefined}
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
