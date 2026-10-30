import { GiftIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui";
import { formatMoney } from "@/lib";
import type { HistoryItem } from "../types";

type ShowMinor = "always" | "nonzero";

type HistoryListProps = {
  items: HistoryItem[];
  currency: string;
  /** How a skipped allowance reads: "Skipped" for the child, "Not given" for a parent. */
  skippedLabel?: string;
  /** Parents see exact amounts ("always"); the child sees "₹500" for whole amounts. */
  showMinor?: ShowMinor;
  /** Extra control beside a line, e.g. the child's undo button on a purchase. */
  renderAction?: (item: HistoryItem) => ReactNode;
};

/** A request moves money between jars. It is not income, so no sign and no "in". */
const MOVE: Record<"withdrawal" | "deposit", string> = {
  withdrawal: "Save → Spend",
  deposit: "Spend → Save",
};

/** `YYYY-MM-DD` as "2 Nov", without shifting the day. */
function day(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function Amount({
  item,
  currency,
  showMinor,
}: {
  item: HistoryItem;
  currency: string;
  showMinor: ShowMinor;
}) {
  if (item.amountMinor === null) return null;
  if (item.kind === "purchase") {
    const spent = formatMoney(item.amountMinor, currency, { showMinor });
    return (
      <span className={item.undone ? "money font-bold text-ink-2 line-through" : "money font-bold"}>
        −{spent}
      </span>
    );
  }
  const given = formatMoney(item.amountMinor, currency, { showMinor });
  // A gentle shortfall: "<given> of <due>".
  const text =
    item.dueMinor === null
      ? given
      : `${given} of ${formatMoney(item.dueMinor, currency, { showMinor })}`;
  return <span className="money font-bold">{text}</span>;
}

/** Allowances, gifts, purchases and skipped ones, newest first. */
export function HistoryList({
  items,
  currency,
  skippedLabel = "Skipped",
  showMinor = "nonzero",
  renderAction,
}: HistoryListProps) {
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
                          <GiftIcon aria-hidden className="mr-1 inline size-4 align-[-0.125em]" />
                          Gift
                          {item.label !== "Gift" ? (
                            <span className="text-ink-2"> · {item.label}</span>
                          ) : null}
                        </>
                      ) : item.kind === "skipped" ? (
                        skippedLabel
                      ) : (
                        item.label
                      )}
                    </span>
                    <span className="text-ink-2 text-sm">
                      {item.kind === "withdrawal" || item.kind === "deposit"
                        ? `${MOVE[item.kind]} · `
                        : null}
                      {day(item.occurredOn)}
                      {item.undone ? " · Undone" : ""}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <Amount item={item} currency={currency} showMinor={showMinor} />
                    {renderAction?.(item)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
