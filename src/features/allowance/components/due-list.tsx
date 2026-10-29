import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { StatusChip } from "@/components/brand";
import { Card } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";
import { formatDay } from "../describe";
import type { DueItem, Gift } from "../types";

type DueListProps = { childId: string; items: DueItem[]; currency: string };

/** What is waiting for the parent to hand over. Each row opens the handover screen. */
export function DueList({ childId, items, currency }: DueListProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="due-title" className="grid gap-3">
      <h2 id="due-title" className="text-h2">
        Due now
      </h2>
      <Card size="sm">
        <ul className="divide-y divide-hairline">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link
                href={routes.parentHandover(childId, item.kind, item.id)}
                className="flex items-center gap-3 px-(--card-spacing) py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {item.kind === "gift" ? "Gift" : "Allowance"}
                    {item.note ? (
                      <span className="font-normal text-ink-2"> · {item.note}</span>
                    ) : null}
                  </span>
                  <span className="block text-ink-2 text-sm">Due {formatDay(item.dueOn)}</span>
                </span>
                <StatusChip status="due" />
                <span className="money font-bold">{formatMoney(item.amountMinor, currency)}</span>
                <span className="sr-only">Hand over</span>
                <ChevronRightIcon aria-hidden className="size-5 text-ink-2" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** Gifts set for a later day. Each row opens the gift's edit screen. */
export function GiftList({
  childId,
  gifts,
  currency,
}: {
  childId: string;
  gifts: Gift[];
  currency: string;
}) {
  if (gifts.length === 0) return null;
  return (
    <section aria-labelledby="gifts-title" className="grid gap-3">
      <h2 id="gifts-title" className="text-h2">
        Gifts coming up
      </h2>
      <Card size="sm">
        <ul className="divide-y divide-hairline">
          {gifts.map((gift) => (
            <li key={gift.id}>
              <Link
                href={routes.parentGiftEdit(childId, gift.id)}
                className="flex items-center gap-3 px-(--card-spacing) py-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    Gift
                    {gift.note ? (
                      <span className="font-normal text-ink-2"> · {gift.note}</span>
                    ) : null}
                  </span>
                  <span className="block text-ink-2 text-sm">On {formatDay(gift.giveOn)}</span>
                </span>
                <span className="money font-bold">{formatMoney(gift.amountMinor, currency)}</span>
                <span className="sr-only">Edit</span>
                <ChevronRightIcon aria-hidden className="size-5 text-ink-2" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
