import { pointsLine } from "@jarso/core/learning";
import { FlameIcon, StarIcon } from "lucide-react";
import { cn } from "@/lib";

/**
 * The child's run and points as one block (2026-11-04): the run as a big number with its flame,
 * the main thing, and the points as a star and a number (no words since 2026-11-06, simpler for
 * kids; screen readers still hear "3 days in a row, 120 points"). On Home's learning card and
 * Learn's header. Points are never money.
 */
export function StreakBadge({
  points,
  streak,
  layout = "column",
  className,
}: {
  points: number;
  streak: number;
  /** `column` stands at the side of Home's card; `row` lies across Learn's header. */
  layout?: "column" | "row";
  className?: string;
}) {
  const on = streak > 0;
  const label = `${streak} ${streak === 1 ? "day" : "days"} in a row, ${pointsLine(points)}`;
  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-4",
        on ? "border-accent/50 bg-accent/10 dark:bg-accent/15" : "border-hairline bg-muted/60",
        layout === "column"
          ? "grid content-center justify-items-center gap-2 text-center sm:min-w-40"
          : "flex flex-wrap items-center gap-x-5 gap-y-2",
        className,
      )}
    >
      <p className="sr-only">{label}</p>
      <p aria-hidden className="flex items-center gap-2">
        <FlameIcon
          className={cn(
            "size-10 shrink-0",
            on ? "fill-accent/30 text-accent-text" : "text-muted-foreground",
          )}
        />
        <span className="font-extrabold text-6xl tabular-nums leading-none">{streak}</span>
      </p>
      <p
        aria-hidden
        className={cn(
          "flex items-center gap-1.5",
          layout === "column"
            ? "w-full justify-center border-hairline border-t pt-2"
            : "rounded-full bg-card px-3 py-1.5",
        )}
      >
        <StarIcon className="size-5 fill-gold text-gold-text" />
        <span className="font-extrabold tabular-nums">{points}</span>
      </p>
    </div>
  );
}
