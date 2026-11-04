import type { LearningOverview } from "@jarso/core/learning";
import { bestMission } from "@jarso/core/learning";
import { FlameIcon, TrophyIcon } from "lucide-react";

/**
 * The child's own bests (demo 3): their best mission and their longest run of days (points sit in
 * the run-and-points block above it since 2026-11-04). A board of one: nobody is ranked against anyone, so there is nothing to lose
 * and no one to beat. Never shown next to money (invariant 11).
 */
export function PersonalBests({ overview }: { overview: LearningOverview }) {
  const best = bestMission(overview.completed);
  const rows = [
    {
      icon: TrophyIcon,
      label: "Best mission",
      value: best
        ? `${best.title}: ${best.firstTry} of ${best.answerable} first try`
        : "Finish a mission to set one.",
      set: best !== null,
    },
    {
      icon: FlameIcon,
      label: "Longest run",
      value:
        overview.longestStreak === 0
          ? "Learn two days in a row to set one."
          : `${overview.longestStreak} ${overview.longestStreak === 1 ? "day" : "days"} in a row`,
      set: overview.longestStreak > 0,
    },
  ];
  return (
    <section aria-labelledby="bests-heading" className="grid gap-3 rounded-xl border bg-card p-4">
      <h2 id="bests-heading" className="eyebrow">
        My bests
      </h2>
      <dl className="grid gap-2">
        {rows.map(({ icon: Icon, label, value, set }) => (
          <div key={label} className="flex items-start gap-2">
            <Icon
              aria-hidden
              className={
                set
                  ? "mt-0.5 size-5 shrink-0 text-gold-text"
                  : "mt-0.5 size-5 shrink-0 text-muted-foreground"
              }
            />
            <div className="grid">
              <dt className="text-ink-2 text-sm">{label}</dt>
              <dd className={set ? "font-bold" : "text-ink-2"}>{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}
