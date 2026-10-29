import { Badge, Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";
import { cadenceAfterAmount, formatDay } from "../describe";
import type { Schedule } from "../types";

type ChildAllowanceCardProps = {
  schedule: Schedule | null;
  /** Allowances waiting for a parent, in minor units. */
  dueTotalMinor: number;
  currency: string;
};

/** The child's view of their allowance: next date, waiting money, paused or stopped. */
export function ChildAllowanceCard({ schedule, dueTotalMinor, currency }: ChildAllowanceCardProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const stopped = schedule?.status === "stopped";
  const paused = schedule?.status === "paused";
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-label="Your allowance" className="grid gap-2">
          <h2 className="text-h3">Your allowance</h2>
          {!schedule ? (
            <p className="text-ink-2">No allowance set up yet.</p>
          ) : stopped ? (
            <p className="text-ink-2">Your allowance has stopped.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="money font-extrabold text-2xl">
                    {money(schedule.amountMinor)}
                  </span>{" "}
                  <span className="font-semibold text-ink-2">
                    {cadenceAfterAmount(schedule.frequency, schedule.anchorOn)}
                  </span>
                </p>
                {paused ? <Badge variant="secondary">Paused</Badge> : null}
              </div>
              {paused ? (
                <>
                  <p>
                    {schedule.pausedThrough
                      ? `Paused until ${formatDay(schedule.pausedThrough)}.${
                          schedule.nextDueOn ? ` Next one: ${formatDay(schedule.nextDueOn)}.` : ""
                        }`
                      : "Paused until a parent resumes it."}
                  </p>
                  {schedule.pauseMessage ? (
                    <p className="text-ink-2">{schedule.pauseMessage}</p>
                  ) : null}
                </>
              ) : schedule.nextDueOn ? (
                <p className="font-semibold">Next: {formatDay(schedule.nextDueOn)}</p>
              ) : null}
            </>
          )}
          {dueTotalMinor > 0 ? (
            <div className="grid gap-1">
              <Badge className="w-fit">{money(dueTotalMinor)} waiting for a parent</Badge>
              <p className="text-ink-2 text-sm">Waiting money isn't in your jars yet.</p>
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
