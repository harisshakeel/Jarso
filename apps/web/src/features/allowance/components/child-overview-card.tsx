import type { Schedule } from "@jarso/core/allowance";
import { describeAllowanceState } from "@jarso/core/allowance";
import Link from "next/link";
import { JarIllustration } from "@/components/jar";
import { Badge, Card } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";

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
 * One child on the parent's Home, compact so a whole family fits in a row: small jars beside
 * the balances, the goal with its bar, where the allowance stands, what's due. Money only, never
 * learning (invariant 11). The whole card opens the child's page; the link is the nickname, so its accessible name stays short, and its
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
    : "Not saving for anything yet";
  const ratio = goal && goal.targetMinor > 0 ? Math.min(counted / goal.targetMinor, 1) : 0;
  return (
    <Card size="sm" className="relative h-full transition-shadow hover:shadow-raised">
      <div className="grid gap-3 px-(--card-spacing)">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary font-extrabold text-secondary-foreground"
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
          <span className="shrink-0 text-ink-2 text-sm">{describeAllowanceState(schedule)}</span>
          {dueCount > 0 ? (
            <Badge variant="count">
              {dueCount}
              <span className="sr-only"> due</span>
            </Badge>
          ) : null}
        </div>
        <div className="flex items-end gap-4">
          <div className="flex items-end gap-2">
            <JarIllustration
              jar="spend"
              size="xs"
              capacityMinor={capacityMinor}
              filledMinor={spendMinor}
            />
            <p className="grid">
              <span className="text-ink-2 text-sm">Spend</span>
              <span className="money font-bold text-money text-primary">{money(spendMinor)}</span>
            </p>
          </div>
          <div className="flex items-end gap-2">
            <JarIllustration
              jar="save"
              size="xs"
              capacityMinor={goal ? goal.targetMinor : capacityMinor}
              filledMinor={counted}
              reservedMinor={reservedMinor}
            />
            <p className="grid">
              <span className="text-ink-2 text-sm">Save</span>
              <span className="money font-bold text-gold-text text-money">{money(saveMinor)}</span>
            </p>
          </div>
        </div>
        <div className="grid gap-1.5">
          <p className="truncate text-sm" title={goalLine}>
            {goalLine}
          </p>
          {goal ? (
            <div aria-hidden className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-gold" style={{ width: `${ratio * 100}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
