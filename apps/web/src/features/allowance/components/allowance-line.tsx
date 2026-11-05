import type { Schedule } from "@jarso/core/allowance";
import { cadenceAfterAmount, formatDay } from "@jarso/core/allowance";
import { formatMoney } from "@/lib";

type AllowanceLineProps = {
  schedule: Schedule | null;
  currency: string;
};

/**
 * The child's pocket money in one short line under the Home greeting, in plain words
 * (2026-11-06, simpler for kids): "You get US$75 every Friday." Money that is due shows as
 * "… is on its way" above the jars, so it is not repeated here.
 */
export function AllowanceLine({ schedule, currency }: AllowanceLineProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const line = !schedule
    ? "No pocket money yet."
    : schedule.status === "stopped"
      ? "Your pocket money has stopped."
      : schedule.status === "paused"
        ? schedule.pausedThrough
          ? `Your pocket money is on a break until ${formatDay(schedule.pausedThrough)}.`
          : "Your pocket money is on a break."
        : `You get ${money(schedule.amountMinor)} ${cadenceAfterAmount(schedule.frequency, schedule.anchorOn)}.`;
  return (
    <section aria-label="Your pocket money">
      <p className={schedule?.status === "active" ? "font-semibold" : "text-ink-2"}>{line}</p>
    </section>
  );
}
