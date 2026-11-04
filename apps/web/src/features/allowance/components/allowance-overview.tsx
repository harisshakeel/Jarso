import type { Schedule } from "@jarso/core/allowance";
import { cadenceAfterAmount, formatDay, runningSchedule } from "@jarso/core/allowance";
import { PauseIcon, SquareIcon } from "lucide-react";
import Link from "next/link";
import { Badge, buttonVariants, Card } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";

export type AllowanceOverviewRow = {
  childId: string;
  nickname: string;
  /** The child's latest schedule (stopped included), or null. */
  schedule: Schedule | null;
  /** Handovers waiting for a parent. */
  dueCount: number;
};

type AllowanceOverviewProps = { rows: AllowanceOverviewRow[]; currency: string };

/** Two beats: "£5 every Sunday. Next one 2 Nov." or what stands in its place. */
function line(schedule: Schedule | null, currency: string): string {
  const running = runningSchedule(schedule);
  if (!running) return "No allowance yet.";
  const amount = `${formatMoney(running.amountMinor, currency)} ${cadenceAfterAmount(running.frequency, running.anchorOn)}.`;
  return running.nextDueOn ? `${amount} Next one ${formatDay(running.nextDueOn)}.` : amount;
}

/** Only a paused or stopped allowance needs a word; running is the normal state. */
function StateNote({ schedule }: { schedule: Schedule | null }) {
  if (!schedule || schedule.status === "active") return null;
  const paused = schedule.status === "paused";
  const Icon = paused ? PauseIcon : SquareIcon;
  const text = paused
    ? schedule.pausedThrough
      ? `Paused until ${formatDay(schedule.pausedThrough)}`
      : "Paused"
    : "Stopped";
  return (
    <p className="flex items-center gap-1 text-ink-2">
      <Icon aria-hidden className="size-4" />
      {text}
    </p>
  );
}

/** Every child's allowance at a glance (the Allowance tab): one card per child at every width. */
export function AllowanceOverview({ rows, currency }: AllowanceOverviewProps) {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const manage = runningSchedule(row.schedule) !== null;
        return (
          <li key={row.childId}>
            <Card size="sm" className="h-full">
              <div className="grid gap-3 px-(--card-spacing)">
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-h3">{row.nickname}</h3>
                  {row.dueCount > 0 ? (
                    <Badge variant="count">
                      {row.dueCount}
                      <span className="sr-only"> due</span>
                    </Badge>
                  ) : null}
                </div>
                <p className={manage ? "money font-semibold text-lg" : "text-ink-2 text-lg"}>
                  {line(row.schedule, currency)}
                </p>
                <StateNote schedule={row.schedule} />
                <Link
                  href={routes.parentAllowance(row.childId)}
                  aria-label={`${manage ? "Manage" : "Set up"} ${row.nickname}'s allowance`}
                  className={buttonVariants({
                    variant: manage ? "secondary" : "default",
                    size: "lg",
                  })}
                >
                  {manage ? "Manage" : "Set up"}
                </Link>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
