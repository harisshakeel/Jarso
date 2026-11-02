import {
  ArrowRightLeftIcon,
  CalendarXIcon,
  CoinsIcon,
  GiftIcon,
  HandCoinsIcon,
  type LucideIcon,
  ShoppingBagIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { JarsoMark } from "@/components/brand";
import { Card, CardContent } from "@/components/ui";
import { cn, formatIsoDate, formatMoney } from "@/lib";
import { categoryOf } from "../categories";
import type { HistoryItem } from "../types";

const JAR_NAME = { spend: "Spend", save: "Save" } as const;

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
  /** The empty line; a parent passes the child's name ("Maya's money story starts here."). */
  emptyLine?: string;
};

/**
 * Each kind in a word a child would use, with its own tinted icon (design.md §6 inbox pattern):
 * money that came in is gold, money spent is teal, a move between jars is cyan, a miss is muted.
 * No signs, no arrows: the words carry the direction.
 */
const KIND: Record<HistoryItem["kind"], { icon: LucideIcon; tint: string; verb: string | null }> = {
  allowance: { icon: CoinsIcon, tint: "bg-gold-100 text-gold-700", verb: "Came in" },
  gift: { icon: GiftIcon, tint: "bg-gold-100 text-gold-700", verb: "Gift" },
  extra: { icon: HandCoinsIcon, tint: "bg-gold-100 text-gold-700", verb: "Extra money" },
  received: { icon: HandCoinsIcon, tint: "bg-gold-100 text-gold-700", verb: "Got" },
  purchase: { icon: ShoppingBagIcon, tint: "bg-teal-100 text-teal-800", verb: "Spent" },
  withdrawal: {
    icon: ArrowRightLeftIcon,
    tint: "bg-cyan-100 text-cyan-700",
    verb: "Moved from Save to Spend",
  },
  deposit: { icon: ArrowRightLeftIcon, tint: "bg-cyan-100 text-cyan-700", verb: "Moved into Save" },
  skipped: { icon: CalendarXIcon, tint: "bg-muted text-ink-2", verb: null },
};

/** `YYYY-MM-DD` as "2 Nov", without shifting the day. */
function day(isoDate: string): string {
  return formatIsoDate(isoDate, { day: "numeric", month: "short" });
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
  const given = formatMoney(item.amountMinor, currency, { showMinor });
  // A gentle shortfall: "<given> of <due>".
  const text =
    item.dueMinor === null
      ? given
      : `${given} of ${formatMoney(item.dueMinor, currency, { showMinor })}`;
  return (
    <span className={cn("money font-bold", item.undone && "text-ink-2")}>
      {text}
      {item.undone ? <span className="sr-only"> (undone)</span> : null}
    </span>
  );
}

/** "Fixed · was £5.00 · Snacks": only what changed; the old name when nothing else did. */
function fixedNote(item: HistoryItem, currency: string, showMinor: ShowMinor): string | null {
  const from = item.fixedFrom;
  if (!from || (item.kind !== "purchase" && item.kind !== "received")) return null;
  const kind = item.kind;
  const parts: string[] = [];
  if (from.amountMinor !== item.amountMinor) {
    parts.push(formatMoney(from.amountMinor, currency, { showMinor }));
  }
  if (categoryOf(from.category, kind).key !== categoryOf(item.category, kind).key) {
    parts.push(categoryOf(from.category, kind).label);
  }
  if (parts.length === 0 && from.label) parts.push(from.label);
  return parts.length === 0 ? "Fixed" : `Fixed · was ${parts.join(" · ")}`;
}

function title(item: HistoryItem, skippedLabel: string): string {
  if (item.kind === "skipped") return skippedLabel;
  if (item.kind === "gift" && item.label !== "Gift") return item.label;
  return item.label;
}

/** Allowances, gifts, purchases, moves and misses, newest first, as a story rather than a statement. */
export function HistoryList({
  items,
  currency,
  skippedLabel = "Skipped",
  showMinor = "nonzero",
  renderAction,
  emptyLine = "Your money story starts here.",
}: HistoryListProps) {
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-label="History" className="grid gap-3">
          <h2 className="text-h3">History</h2>
          {items.length === 0 ? (
            <div className="grid justify-items-center gap-2 py-4 text-center">
              <JarsoMark size={48} />
              <p className="font-semibold">{emptyLine}</p>
            </div>
          ) : (
            <ul className="grid gap-2">
              {items.map((item) => {
                const { icon: Icon, tint, verb } = KIND[item.kind];
                const subline = [
                  item.kind === "gift" && item.label !== "Gift" ? "Gift" : verb,
                  item.kind === "received" && item.jar ? `into ${JAR_NAME[item.jar]}` : null,
                  day(item.occurredOn),
                ]
                  .filter(Boolean)
                  .join(" · ");
                const fixed = fixedNote(item, currency, showMinor);
                return (
                  <li
                    key={`${item.kind}-${item.id}`}
                    className={cn(
                      "relative flex items-center gap-3 py-1",
                      item.undone && "opacity-70",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-full",
                        tint,
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="grid min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                        {item.kind === "purchase" || item.kind === "received" ? (
                          <span aria-hidden>{categoryOf(item.category, item.kind).emoji}</span>
                        ) : null}
                        <span className="truncate">{title(item, skippedLabel)}</span>
                      </span>
                      <span className="truncate text-ink-2">
                        {subline}
                        {fixed ? ` · ${fixed}` : ""}
                        {item.undone ? " · Undone" : ""}
                        {item.paidByCard ? " · Paid by card" : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Amount item={item} currency={currency} showMinor={showMinor} />
                      {renderAction?.(item)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
