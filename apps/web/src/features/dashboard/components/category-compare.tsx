import { type CategoryRow, periodOf } from "@jarso/core/dashboard";
import { Card, CardContent } from "@/components/ui";
import { cn, formatMoney } from "@/lib";
import { seriesOf } from "./series";

/**
 * Spending by category, this period against the one before (spec answer 4): one pair of thin
 * bars per category on one shared scale, the biggest change in a sentence above them, every
 * figure written beside its bar. This period is solid (in the child's colour when one child is
 * picked); the one before is a muted bar.
 */
export function CategoryCompare({
  rows,
  days,
  currency,
  sentence,
  slot,
}: {
  rows: CategoryRow[];
  days: number;
  currency: string;
  sentence: string;
  /** The picked child's colour slot, or null for the family. */
  slot: number | null;
}) {
  const period = periodOf(days);
  const money = (minor: number) => formatMoney(minor, currency);
  const max = Math.max(1, ...rows.flatMap((row) => [row.nowMinor, row.beforeMinor]));
  const now = slot === null ? "bg-primary" : seriesOf(slot).bar;
  const width = (minor: number) => `${Math.max(minor > 0 ? 2 : 0, (minor / max) * 100)}%`;
  return (
    <Card className="shadow-raised">
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          <h2 className="text-h3">Spending by category</h2>
          <p className="text-ink-2">{sentence}</p>
        </div>
        {rows.length > 0 ? (
          <>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ink-2 text-sm" aria-hidden>
              <li className="flex items-center gap-1.5">
                <span className={cn("inline-block h-2 w-4 rounded-sm", now)} />
                {period.label}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded-sm bg-hairline-strong" />
                {period.before.charAt(0).toUpperCase() + period.before.slice(1)}
              </li>
            </ul>
            <ul className="grid gap-3">
              {rows.map((row) => (
                <li key={row.key} className="grid gap-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      <span aria-hidden>{row.emoji}</span> {row.label}
                    </span>
                    <span className="text-sm">
                      <span className="money font-bold">{money(row.nowMinor)}</span>
                      <span className="text-ink-2">
                        {" "}
                        {period.now}, {money(row.beforeMinor)} {period.before}
                      </span>
                    </span>
                  </p>
                  <div aria-hidden className="grid gap-0.5">
                    <span
                      className={cn("block h-2 rounded-r-full", now)}
                      style={{ width: width(row.nowMinor) }}
                    />
                    <span
                      className="block h-2 rounded-r-full bg-hairline-strong"
                      style={{ width: width(row.beforeMinor) }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
