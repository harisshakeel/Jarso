import { type Moment, type MomentKind, momentsCopy } from "@jarso/core/notifications";
import {
  CoinsIcon,
  FlameIcon,
  GiftIcon,
  GraduationCapIcon,
  HandCoinsIcon,
  type LucideIcon,
  TrophyIcon,
} from "lucide-react";
import { cn } from "@/lib";

// Money in is gold, learning teal, a run cyan (design.md §2.5); a goal reached is the gold trophy.
const STYLE: Record<MomentKind, { icon: LucideIcon; tint: string }> = {
  mission: {
    icon: GraduationCapIcon,
    tint: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  },
  allowance: { icon: CoinsIcon, tint: "bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold" },
  gift: { icon: GiftIcon, tint: "bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold" },
  extra: { icon: HandCoinsIcon, tint: "bg-gold-100 text-gold-700 dark:bg-gold-900 dark:text-gold" },
  goal: { icon: TrophyIcon, tint: "bg-gold text-gold-foreground" },
  best: { icon: FlameIcon, tint: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300" },
};

const MONEY = new Set<MomentKind>(["allowance", "gift", "extra"]);

/** "Today", "Yesterday" or "3 Nov", without shifting the day. */
function when(on: string, today: string): string {
  if (on === today) return "Today";
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (on === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${on}T00:00:00Z`));
}

/**
 * The top of the child's Notifications (2026-11-04): the big things from the last month, newest first,
 * a goal reached leading. Read-only rows; the messages below are the ones to open.
 */
export function BigMoments({ items, today }: { items: Moment[]; today: string }) {
  return (
    <section aria-labelledby="big-moments-title" className="grid gap-2">
      <h2 id="big-moments-title" className="text-h3">
        {momentsCopy.heading}
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-card p-4 text-ink-2">
          {momentsCopy.none}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((moment) => {
            const { icon: Icon, tint } = STYLE[moment.kind];
            return (
              <li
                key={moment.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card p-4",
                  moment.kind === "goal" ? "border-gold sm:col-span-2" : "border-hairline",
                )}
              >
                <span
                  aria-hidden
                  className={cn("grid size-11 shrink-0 place-items-center rounded-full", tint)}
                >
                  <Icon className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="font-semibold">{moment.title}</span>
                  <span className="text-ink-2">
                    <span className={MONEY.has(moment.kind) ? "money" : undefined}>
                      {moment.detail}
                    </span>
                    {moment.on ? ` · ${when(moment.on, today)}` : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
