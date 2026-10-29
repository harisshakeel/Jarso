import Link from "next/link";
import { buttonVariants, Card, CardContent } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";
import { cadenceAfterAmount, describeAllowanceState } from "../describe";
import type { Schedule } from "../types";

type ParentAllowanceCardProps = {
  childId: string;
  /** The child's latest schedule (stopped included), or null. */
  schedule: Schedule | null;
  currency: string;
};

/** The parent's allowance card on the child page: amount, how often, where it stands, one action. */
export function ParentAllowanceCard({ childId, schedule, currency }: ParentAllowanceCardProps) {
  const running = schedule && schedule.status !== "stopped" ? schedule : null;
  return (
    <Card>
      <CardContent>
        <section aria-labelledby="allowance-title" className="grid gap-3">
          <h2 id="allowance-title" className="text-h3">
            Allowance
          </h2>
          {running ? (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="money font-extrabold text-money">
                {formatMoney(running.amountMinor, currency)}
              </span>{" "}
              <span className="font-semibold text-ink-2">
                {cadenceAfterAmount(running.frequency, running.anchorOn)}
              </span>
            </p>
          ) : null}
          <p className={running ? "font-semibold" : "text-ink-2"}>
            {describeAllowanceState(schedule)}
          </p>
          <Link
            href={routes.parentAllowance(childId)}
            className={buttonVariants({
              variant: running ? "secondary" : "default",
              size: "lg",
              className: "w-fit",
            })}
          >
            {running ? "Manage" : "Set up allowance"}
          </Link>
        </section>
      </CardContent>
    </Card>
  );
}
