import Link from "next/link";
import { JarIllustration } from "@/components/jar";
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
  /** Save promised to withdrawals; drawn hatched and left out of goal progress. */
  reservedMinor: number;
  /** The shared jar scale (jarCapacity), used for Spend, and for Save without a goal. */
  capacityMinor: number;
  /** The child's active goal, or null. */
  goal: { emoji: string; name: string; targetMinor: number; planMinor: number | null } | null;
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
  reservedMinor,
  capacityMinor,
  goal,
  schedule,
  dueCount,
  currency,
}: ChildOverviewCardProps) {
  const money = (minor: number) => formatMoney(minor, currency);
  const short = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const counted = Math.max(saveMinor - reservedMinor, 0);
  const goalLine = goal
    ? [
        `${goal.emoji} ${goal.name}`,
        `${short(counted)} of ${short(goal.targetMinor)}`,
        goal.planMinor ? `plans ${short(goal.planMinor)} each allowance` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "No goal yet";
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
        <div className="grid grid-cols-2 gap-3">
          <div className="grid justify-items-center gap-1 text-center">
            <JarIllustration
              jar="spend"
              size="sm"
              capacityMinor={capacityMinor}
              filledMinor={spendMinor}
            />
            <p className="text-sm">
              Spend <span className="money font-bold">{money(spendMinor)}</span>
            </p>
          </div>
          <div className="grid justify-items-center gap-1 text-center">
            <JarIllustration
              jar="save"
              size="sm"
              capacityMinor={goal ? goal.targetMinor : capacityMinor}
              filledMinor={counted}
              reservedMinor={reservedMinor}
              goal={goal ? { emoji: goal.emoji } : null}
            />
            <p className="text-sm">
              Save <span className="money font-bold">{money(saveMinor)}</span>
            </p>
          </div>
        </div>
        <p className="text-sm">{goalLine}</p>
        <p className="text-ink-2 text-sm">{describeAllowanceState(schedule)}</p>
      </div>
    </Card>
  );
}
