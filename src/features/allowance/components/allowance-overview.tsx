import { cn } from "cn";
import Link from "next/link";
import { Badge, buttonVariants, Card } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";
import { cadenceAfterAmount, formatDay } from "../describe";
import type { Schedule } from "../types";

export type AllowanceOverviewRow = {
  childId: string;
  nickname: string;
  /** The child's latest schedule (stopped included), or null. */
  schedule: Schedule | null;
  /** Handovers waiting for a parent. */
  dueCount: number;
};

type AllowanceOverviewProps = { rows: AllowanceOverviewRow[]; currency: string };

/** A running or paused schedule; a stopped one reads like none. */
const runningOf = (schedule: Schedule | null) =>
  schedule && schedule.status !== "stopped" ? schedule : null;

function amountLine(schedule: Schedule | null, currency: string): string {
  const running = runningOf(schedule);
  if (!running) return "No allowance yet";
  return `${formatMoney(running.amountMinor, currency)} ${cadenceAfterAmount(running.frequency, running.anchorOn)}`;
}

function StatusBadge({ schedule }: { schedule: Schedule | null }) {
  if (!schedule) return <span className="text-muted-foreground">—</span>;
  switch (schedule.status) {
    case "active":
      return <Badge variant="secondary">Active</Badge>;
    case "paused":
      return (
        <Badge variant="outline">
          {schedule.pausedThrough ? `Paused until ${formatDay(schedule.pausedThrough)}` : "Paused"}
        </Badge>
      );
    case "stopped":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Stopped
        </Badge>
      );
  }
}

function DueBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Badge variant="count">
      {count}
      <span className="sr-only"> due</span>
    </Badge>
  );
}

/** "Manage" for a running allowance, "Set up" otherwise. 36 px in the table, 44 px on phones. */
function RowAction({ row, size }: { row: AllowanceOverviewRow; size: "sm" | "lg" }) {
  const manage = runningOf(row.schedule) !== null;
  return (
    <Link
      href={routes.parentAllowance(row.childId)}
      aria-label={`${manage ? "Manage" : "Set up"} ${row.nickname}'s allowance`}
      className={buttonVariants({ variant: manage ? "secondary" : "default", size })}
    >
      {manage ? "Manage" : "Set up"}
    </Link>
  );
}

const nextOf = (schedule: Schedule | null) => {
  const next = runningOf(schedule)?.nextDueOn;
  return next ? formatDay(next) : "—";
};

/** Every child's allowance at a glance (the Allowance tab). Table from 768 px, cards below. */
export function AllowanceOverview({ rows, currency }: AllowanceOverviewProps) {
  return (
    <>
      <Card size="sm" className="hidden md:flex">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
              <th scope="col" className="px-(--card-spacing) pb-2 font-semibold">
                Child
              </th>
              <th scope="col" className="px-2 pb-2 font-semibold">
                Allowance
              </th>
              <th scope="col" className="px-2 pb-2 font-semibold">
                Next
              </th>
              <th scope="col" className="px-2 pb-2 font-semibold">
                Status
              </th>
              <th scope="col" className="px-2 pb-2 font-semibold">
                Due
              </th>
              <th scope="col" className="px-(--card-spacing) pb-2">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline border-hairline border-t">
            {rows.map((row) => (
              <tr key={row.childId}>
                <td className="px-(--card-spacing) py-2 font-bold">{row.nickname}</td>
                <td
                  className={cn(
                    "money px-2 py-2",
                    runningOf(row.schedule) ? "font-semibold" : "text-ink-2",
                  )}
                >
                  {amountLine(row.schedule, currency)}
                </td>
                <td className="px-2 py-2 text-ink-2">{nextOf(row.schedule)}</td>
                <td className="px-2 py-2">
                  <StatusBadge schedule={row.schedule} />
                </td>
                <td className="px-2 py-2">
                  <DueBadge count={row.dueCount} />
                </td>
                <td className="px-(--card-spacing) py-2 text-right">
                  <RowAction row={row} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <ul className="grid gap-4 md:hidden">
        {rows.map((row) => (
          <li key={row.childId}>
            <Card size="sm">
              <div className="grid gap-3 px-(--card-spacing)">
                <div className="flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate font-bold text-h3">{row.nickname}</h2>
                  <DueBadge count={row.dueCount} />
                  <StatusBadge schedule={row.schedule} />
                </div>
                <div className="grid gap-1">
                  <p className="money font-semibold">{amountLine(row.schedule, currency)}</p>
                  {runningOf(row.schedule)?.nextDueOn ? (
                    <p className="text-ink-2 text-sm">Next: {nextOf(row.schedule)}</p>
                  ) : null}
                </div>
                <RowAction row={row} size="lg" />
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
