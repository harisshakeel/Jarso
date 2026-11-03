import type { Schedule } from "@jarso/core/allowance";
import { cadenceAfterAmount, formatDay } from "@jarso/core/allowance";
import { Badge } from "@/components/ui";
import { formatMoney } from "@/lib";

type AllowanceLineProps = {
  schedule: Schedule | null;
  currency: string;
};

/**
 * The child's allowance in one line under the Home greeting: how much and when, or why not right now.
 * Money that is due is already drawn above the jars, so it is not repeated here.
 */
export function AllowanceLine({ schedule, currency }: AllowanceLineProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  if (!schedule) {
    return (
      <section aria-label="Your allowance">
        <p className="text-ink-2">No allowance set up yet.</p>
      </section>
    );
  }
  if (schedule.status === "stopped") {
    return (
      <section aria-label="Your allowance">
        <p className="text-ink-2">Your allowance has stopped.</p>
      </section>
    );
  }
  if (schedule.status === "paused") {
    return (
      <section aria-label="Your allowance" className="grid gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            {money(schedule.amountMinor)}{" "}
            {cadenceAfterAmount(schedule.frequency, schedule.anchorOn)}
          </span>
          <Badge variant="secondary">Paused</Badge>
        </p>
        <p className="text-ink-2">
          {schedule.pausedThrough
            ? `Paused until ${formatDay(schedule.pausedThrough)}.${
                schedule.nextDueOn ? ` Next one: ${formatDay(schedule.nextDueOn)}.` : ""
              }`
            : "Paused until a parent resumes it."}
        </p>
        {schedule.pauseMessage ? <p className="text-ink-2">{schedule.pauseMessage}</p> : null}
      </section>
    );
  }
  return (
    <section aria-label="Your allowance">
      <p className="flex flex-wrap items-center gap-x-2">
        <span className="font-semibold">
          {money(schedule.amountMinor)} {cadenceAfterAmount(schedule.frequency, schedule.anchorOn)}
        </span>
        {schedule.nextDueOn ? (
          <span className="text-ink-2">Next: {formatDay(schedule.nextDueOn)}</span>
        ) : null}
      </p>
    </section>
  );
}
