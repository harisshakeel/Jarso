import type { ChildDueItem } from "@jarso/core/allowance";
import { dueKindLabel, formatDay, needsYouCopy } from "@jarso/core/allowance";
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
  /** Family-local today, for how long each handover has waited; left out, no age is shown. */
  today?: string;
};

function What({ item }: { item: ChildDueItem }) {
  return (
    <>
      {dueKindLabel(item.kind)}
      {item.note ? <span className="font-normal text-ink-2"> · {item.note}</span> : null}
    </>
  );
}

/** Whole days from one family date to another; dates compare as UTC midnights. */
function daysFrom(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * What waits on the parent (design.md §5, §10; compact since 2026-11-04): one row per handover,
 * oldest first, with the child, what it is, when it was due and how long ago, the amount and
 * one action. Rows keep Home on one screen. With nothing waiting it shrinks to an
 * "All caught up." chip.
 */
export function NeedsYou({ items, currency, otherCount = 0, today }: NeedsYouProps) {
  const money = (minor: number) => formatMoney(minor, currency);
  const waiting = items.length + otherCount;
  if (waiting === 0) {
    // Nothing waits: a quiet chip, still a named region.
    return (
      <section aria-labelledby="needs-you-title">
        <h2 id="needs-you-title" className="sr-only">
          {needsYouCopy.title}
        </h2>
        <p className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-tint-teal px-3 font-semibold text-primary text-sm">
          <CheckIcon aria-hidden className="size-4" />
          {needsYouCopy.allCaughtUp}
        </p>
      </section>
    );
  }
  return (
    <section id="needs-you" aria-labelledby="needs-you-title" className="grid scroll-mt-6 gap-3">
      <h2 id="needs-you-title" className="flex items-center gap-2 text-h2">
        {needsYouCopy.title}
        <Badge variant="count">
          {waiting}
          <span className="sr-only">{needsYouCopy.waiting}</span>
        </Badge>
      </h2>
      {items.length === 0 ? null : (
        <Card size="sm" className="py-0">
          <ul className="divide-y divide-hairline">
            {items.map((item) => {
              const Icon = item.kind === "gift" ? GiftIcon : HandCoinsIcon;
              const ago = today ? daysFrom(item.dueOn, today) : 0;
              return (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tint-teal text-primary"
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="truncate">
                      <span className="font-bold">{item.nickname}</span>
                      <span className="text-ink-2"> · </span>
                      <span className="font-semibold">
                        <What item={item} />
                      </span>
                    </p>
                    <p className="text-ink-2 text-sm">
                      {needsYouCopy.due(formatDay(item.dueOn))}
                      {ago > 0 ? (
                        <span className="font-semibold text-gold-text">
                          {" · "}
                          {needsYouCopy.late(ago)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className="money font-bold text-lg">{money(item.amountMinor)}</span>
                  <Link
                    href={routes.parentHandover(item.childId, item.kind, item.id)}
                    aria-label={needsYouCopy.handOverLabel(
                      item.kind,
                      item.nickname,
                      formatDay(item.dueOn),
                    )}
                    className={buttonVariants({ size: "default" })}
                  >
                    {needsYouCopy.handOver}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
