import type { Schedule } from "@jarso/core/allowance";
import {
  allowanceSummaryCopy,
  cadenceAfterAmount,
  formatDay,
  runningSchedule,
} from "@jarso/core/allowance";
import { AlertCircleIcon, PauseIcon, SquareIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { cn, formatMoney } from "@/lib";

type AllowanceBriefProps = {
  childId: string;
  nickname: string;
  /** The child's latest schedule (stopped included), or null. */
  schedule: Schedule | null;
  /** Handovers waiting for a parent. */
  dueCount: number;
  currency: string;
  className?: string;
};

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
    <p className="flex items-center gap-1 text-ink-2 text-sm">
      <Icon aria-hidden className="size-4" />
      {text}
    </p>
  );
}

/**
 * A child's allowance in brief (2026-11-05, moved from Money into each child's card on
 * Children): how much and when, a paused or stopped note, handovers waiting, and Manage (or Set
 * up), which opens that child's Allowance page.
 */
export function AllowanceBrief({
  childId,
  nickname,
  schedule,
  dueCount,
  currency,
  className,
}: AllowanceBriefProps) {
  const manage = runningSchedule(schedule) !== null;
  return (
    <section
      aria-label={`${nickname}'s allowance`}
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/60 p-4",
        className,
      )}
    >
      <div className="grid min-w-0 gap-1">
        <h4 className="font-semibold text-ink-2 text-sm">Allowance</h4>
        <p className={manage ? "money font-semibold" : "text-ink-2"}>{line(schedule, currency)}</p>
        <StateNote schedule={schedule} />
        {dueCount > 0 ? (
          <p className="flex items-center gap-1 font-semibold text-gold-text text-sm">
            <AlertCircleIcon aria-hidden className="size-4" />
            {allowanceSummaryCopy.dueWaiting(dueCount)}
          </p>
        ) : null}
      </div>
      <Link
        href={routes.parentAllowance(childId)}
        aria-label={`${manage ? "Manage" : "Set up"} ${nickname}'s allowance`}
        className={buttonVariants({ variant: manage ? "secondary" : "default" })}
      >
        {manage ? "Manage" : "Set up"}
      </Link>
    </section>
  );
}
