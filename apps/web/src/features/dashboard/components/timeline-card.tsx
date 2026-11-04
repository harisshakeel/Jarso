import { dashboardCopy, type TimelineEvent, weekday } from "@jarso/core/dashboard";
import { CalendarDaysIcon, CoinsIcon, GiftIcon, TargetIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import { ChildChip } from "./series";

const ICONS = { allowance: CoinsIcon, gift: GiftIcon, goal: TargetIcon } as const;

/**
 * The next two weeks (spec answer 7): allowances falling due, planned gifts and goals the plan
 * reaches, family-wide or for the picked child, grouped by day.
 */
export function TimelineCard({ events }: { events: TimelineEvent[] }) {
  const days = [...new Set(events.map((event) => event.date))];
  return (
    <Card className="shadow-raised">
      <CardContent className="grid gap-3">
        <h2 className="flex items-center gap-2 text-h3">
          <CalendarDaysIcon aria-hidden className="size-5 text-accent-text" />
          {dashboardCopy.timelineTitle}
        </h2>
        {events.length === 0 ? (
          <p className="text-ink-2">{dashboardCopy.timelineEmpty}</p>
        ) : (
          <ol className="grid gap-3">
            {days.map((date) => (
              <li key={date} className="grid gap-1.5">
                <h3 className="font-bold text-ink-2 text-sm">{weekday(date)}</h3>
                <ul className="grid gap-1.5">
                  {events
                    .filter((event) => event.date === date)
                    .map((event) => {
                      const Icon = ICONS[event.kind];
                      return (
                        <li
                          key={`${event.childId}-${event.kind}-${event.text}`}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <Icon aria-hidden className="size-4 shrink-0 text-ink-2" />
                          <ChildChip nickname={event.nickname} slot={event.slot} />
                          <span>{event.text}</span>
                        </li>
                      );
                    })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
