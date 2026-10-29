import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";
import { describeAllowanceState } from "../describe";
import type { Schedule } from "../types";

type ChildOverviewCardProps = {
  childId: string;
  nickname: string;
  /** Confirmed jar balances, minor units. */
  spendMinor: number;
  saveMinor: number;
  schedule: Schedule | null;
  /** Handovers waiting for a parent. */
  dueCount: number;
  currency: string;
};

/**
 * One child on the parent's Home: jars, where the allowance stands, what's due. The whole card
 * opens the child's page; the link is the nickname, so its accessible name stays short, and its
 * focus ring is drawn on the overlay so it outlines the whole card.
 */
export function ChildOverviewCard({
  childId,
  nickname,
  spendMinor,
  saveMinor,
  schedule,
  dueCount,
  currency,
}: ChildOverviewCardProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <Card className="relative transition-shadow hover:shadow-raised">
      <div className="grid gap-3 px-(--card-spacing)">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary font-extrabold text-secondary-foreground"
          >
            {nickname.charAt(0).toUpperCase()}
          </span>
          <h3 className="min-w-0 flex-1 truncate font-bold text-h3">
            <Link
              href={routes.parentChild(childId)}
              className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-ring focus-visible:after:-outline-offset-3"
            >
              {nickname}
            </Link>
          </h3>
          {dueCount > 0 ? (
            <Badge variant="count">
              {dueCount}
              <span className="sr-only"> due</span>
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary px-3 text-secondary-foreground text-sm">
            Spend <span className="money font-bold">{money(spendMinor)}</span>
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-full bg-gold/25 px-3 text-sm">
            Save <span className="money font-bold">{money(saveMinor)}</span>
          </span>
        </div>
        <p className="text-ink-2 text-sm">{describeAllowanceState(schedule)}</p>
      </div>
    </Card>
  );
}
