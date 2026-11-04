import { formatDay } from "@jarso/core/allowance";
import {
  type DashboardChild,
  dashboardTotals,
  parentPageCopy,
  timeline,
} from "@jarso/core/dashboard";
import { Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";

/**
 * Home's one strip of figures (2026-11-04): handed over this week, still to hand over, and the
 * next thing coming up. Three numbers and nothing more; the chart and the rest are on Children.
 */
export function ThisWeekStrip({
  kids,
  currency,
  today,
}: {
  kids: DashboardChild[];
  currency: string;
  today: string;
}) {
  const money = (minor: number) => formatMoney(minor, currency);
  const totals = dashboardTotals(kids, today);
  const [next] = timeline(kids, today, currency);
  const tiles = [
    { label: parentPageCopy.handedOver, value: String(totals.handedOver) },
    {
      label: parentPageCopy.stillDue,
      value: totals.waiting === 0 ? "0" : `${totals.waiting} · ${money(totals.waitingMinor)}`,
    },
    {
      label: parentPageCopy.nextUp,
      value: next
        ? `${formatDay(next.date)} · ${next.nickname}: ${next.text}`
        : parentPageCopy.nothingComing,
      small: true,
    },
  ];
  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="text-h3">{parentPageCopy.thisWeek}</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="grid gap-0.5">
              <dt className="text-ink-2 text-sm">{tile.label}</dt>
              <dd className={tile.small ? "font-semibold" : "money font-extrabold text-money-l"}>
                {tile.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
