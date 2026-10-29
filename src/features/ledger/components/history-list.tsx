import { Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";
import type { HistoryItem } from "../types";

type HistoryListProps = { items: HistoryItem[]; currency: string };

/** `YYYY-MM-DD` as "2 Nov", without shifting the day. */
function day(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function Amount({ item, currency }: { item: HistoryItem; currency: string }) {
  if (item.amountMinor === null) return null;
  const given = formatMoney(item.amountMinor, currency, { showMinor: "nonzero" });
  // A gentle shortfall: "<given> of <due>".
  const text =
    item.dueMinor === null
      ? given
      : `${given} of ${formatMoney(item.dueMinor, currency, { showMinor: "nonzero" })}`;
  return <span className="money font-bold">{text}</span>;
}

/** Allowances, gifts and skipped ones, newest first. */
export function HistoryList({ items, currency }: HistoryListProps) {
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-label="History" className="grid gap-3">
          <h2 className="text-h3">History</h2>
          {items.length === 0 ? (
            <p className="text-ink-2">Your money story starts here.</p>
          ) : (
            <ul className="grid gap-3">
              {items.map((item) => (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <div className="grid">
                    <span>
                      {item.kind === "gift" ? (
                        <>
                          <span aria-hidden>🎁</span> {item.label}
                        </>
                      ) : item.kind === "skipped" ? (
                        "Skipped"
                      ) : (
                        item.label
                      )}
                    </span>
                    <span className="text-ink-2 text-sm">{day(item.occurredOn)}</span>
                  </div>
                  <Amount item={item} currency={currency} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
