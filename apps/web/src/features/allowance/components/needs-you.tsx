import type { ChildDueItem } from "@jarso/core/allowance";
import { formatDay } from "@jarso/core/allowance";
import { CheckIcon, GiftIcon, HandCoinsIcon } from "lucide-react";
import Link from "next/link";
import { Badge, buttonVariants, Card } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";

type NeedsYouProps = {
  /** Every due allowance and gift across the family, oldest first. */
  items: ChildDueItem[];
  currency: string;
  /** Requests and notices also waiting on the parent, listed under this section. */
  otherCount?: number;
};

function What({ item }: { item: ChildDueItem }) {
  return (
    <>
      {item.kind === "gift" ? "Gift" : "Allowance"}
      {item.note ? <span className="font-normal text-ink-2"> · {item.note}</span> : null}
    </>
  );
}

/**
 * The first thing on the parent's Home (design.md §5, §10): what is waiting to be handed over,
 * one card per item at every width, each with its own action. Never a table. With nothing
 * waiting it shrinks to an "All caught up." chip.
 */
export function NeedsYou({ items, currency, otherCount = 0 }: NeedsYouProps) {
  const money = (minor: number) => formatMoney(minor, currency);
  const waiting = items.length + otherCount;
  if (waiting === 0) {
    // Nothing waits: a quiet chip (the page puts it in its header), still a named region.
    return (
      <section aria-labelledby="needs-you-title">
        <h2 id="needs-you-title" className="sr-only">
          Needs you
        </h2>
        <p className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-tint-teal px-3 font-semibold text-primary text-sm">
          <CheckIcon aria-hidden className="size-4" />
          All caught up.
        </p>
      </section>
    );
  }
  return (
    <section id="needs-you" aria-labelledby="needs-you-title" className="grid scroll-mt-6 gap-3">
      <h2 id="needs-you-title" className="flex items-center gap-2 text-h2">
        Needs you
        {waiting > 0 ? (
          <Badge variant="count">
            {waiting}
            <span className="sr-only"> waiting</span>
          </Badge>
        ) : null}
      </h2>
      {items.length === 0 ? null : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((item) => {
            const Icon = item.kind === "gift" ? GiftIcon : HandCoinsIcon;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Card size="sm" className="h-full shadow-raised">
                  <div className="grid gap-3 px-(--card-spacing)">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300"
                      >
                        <Icon className="size-5" />
                      </span>
                      <div className="grid min-w-0 flex-1 gap-0.5">
                        <h3 className="truncate text-h3">{item.nickname}</h3>
                        <p className="font-semibold">
                          <What item={item} />
                        </p>
                        <p className="text-ink-2">Due {formatDay(item.dueOn)}</p>
                      </div>
                      <span className="money font-bold text-money-l">
                        {money(item.amountMinor)}
                      </span>
                    </div>
                    <Link
                      href={routes.parentHandover(item.childId, item.kind, item.id)}
                      aria-label={`Hand over ${item.kind} to ${item.nickname}, due ${formatDay(item.dueOn)}`}
                      className={buttonVariants({ size: "lg" })}
                    >
                      Hand over
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
