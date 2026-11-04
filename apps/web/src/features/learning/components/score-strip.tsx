import { pointsLine, streakLine } from "@jarso/core/learning";
import { FlameIcon, StarIcon } from "lucide-react";

/**
 * Points and days in a row (demo 3), on the Learn header. Points reward thinking, the run
 * rewards showing up, and a broken run is never called lost (FR12). Never next to money.
 */
export function ScoreStrip({ points, streak }: { points: number; streak: number }) {
  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-1">
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Points</dt>
        <StarIcon aria-hidden className="size-5 fill-gold text-gold-text" />
        <dd className="font-extrabold tabular-nums">{pointsLine(points)}</dd>
      </div>
      <div className="flex items-center gap-1.5">
        <dt className="sr-only">Days in a row</dt>
        <FlameIcon
          aria-hidden
          className={streak > 0 ? "size-5 text-accent-text" : "size-5 text-muted-foreground"}
        />
        <dd className={streak > 0 ? "font-extrabold" : "text-ink-2"}>{streakLine(streak)}</dd>
      </div>
    </dl>
  );
}
