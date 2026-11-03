import type { DashboardTotals } from "@jarso/core/dashboard";
import { Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";

/**
 * The family's money in one card (spec answer 6), never one per child: what the children hold in
 * Spend, what the parent holds for them in Save, and this week's handovers. With a child picked,
 * the same card for that child.
 */
export function FamilyTotals({
  totals,
  currency,
  who,
}: {
  totals: DashboardTotals;
  currency: string;
  /** The picked child's nickname, or null for the whole family. */
  who: string | null;
}) {
  const money = (minor: number) => formatMoney(minor, currency);
  const forWhom = who ?? `${totals.children} ${totals.children === 1 ? "child" : "children"}`;
  const tiles = [
    {
      label: who ? `${who} holds in Spend` : "The children hold in Spend",
      value: money(totals.spendMinor),
    },
    { label: `You're holding in Save for ${forWhom}`, value: money(totals.saveMinor) },
    {
      label: "Handed over this week",
      value: String(totals.handedOver),
      note:
        totals.waiting > 0
          ? `${totals.waiting} still to hand over (${money(totals.waitingMinor)})`
          : "Nothing waiting",
    },
  ];
  return (
    <Card className="shadow-raised">
      <CardContent className="grid gap-4">
        <h2 className="text-h3">{who ? `${who}'s money` : "Family money"}</h2>
        <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-1">
          {tiles.map((tile) => (
            <div key={tile.label} className="grid gap-0.5">
              <dt className="text-ink-2 text-sm">{tile.label}</dt>
              <dd className="money font-extrabold text-money-l">{tile.value}</dd>
              {tile.note ? <dd className="text-ink-2 text-sm">{tile.note}</dd> : null}
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
