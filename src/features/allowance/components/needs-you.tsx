import { GiftIcon } from "lucide-react";
import Link from "next/link";
import { Badge, buttonVariants, Card } from "@/components/ui";
import { routes } from "@/config";
import { formatMoney } from "@/lib";
import { formatDay } from "../describe";
import type { ChildDueItem } from "../types";

type NeedsYouProps = {
  /** Every due allowance and gift across the family, oldest first. */
  items: ChildDueItem[];
  currency: string;
};

function What({ item }: { item: ChildDueItem }) {
  return (
    <>
      {item.kind === "gift" ? (
        <>
          <GiftIcon aria-hidden className="mr-1 inline size-4 align-[-0.125em]" />
          Gift
        </>
      ) : (
        "Allowance"
      )}
      {item.note ? <span className="font-normal text-ink-2"> · {item.note}</span> : null}
    </>
  );
}

/** 36 px in the table (design.md §11 allows it in parent tables), 44 px on phones. */
function HandOverLink({ item, size }: { item: ChildDueItem; size: "sm" | "lg" }) {
  return (
    <Link
      href={routes.parentHandover(item.childId, item.kind, item.id)}
      aria-label={`Hand over ${item.kind} to ${item.nickname}, due ${formatDay(item.dueOn)}`}
      className={buttonVariants({ size })}
    >
      Hand over
    </Link>
  );
}

/**
 * The first thing on the parent's Home (design.md §5, §10): what is waiting to be handed over,
 * each with its action inline. A table from 768 px, a stacked list below.
 */
export function NeedsYou({ items, currency }: NeedsYouProps) {
  const money = (minor: number) => formatMoney(minor, currency);
  const key = (item: ChildDueItem) => `${item.kind}-${item.id}`;
  return (
    <section aria-labelledby="needs-you-title" className="grid gap-3">
      <h2 id="needs-you-title" className="eyebrow flex items-center gap-2">
        Needs you
        {items.length > 0 ? (
          <Badge variant="count">
            {items.length}
            <span className="sr-only"> waiting</span>
          </Badge>
        ) : null}
      </h2>
      {items.length === 0 ? (
        <Card size="sm">
          <p className="px-(--card-spacing) font-semibold">All caught up.</p>
        </Card>
      ) : (
        <Card size="sm" className="shadow-raised">
          <table className="hidden w-full text-left text-sm md:table">
            <thead>
              <tr className="text-muted-foreground text-xs uppercase tracking-[0.08em]">
                <th scope="col" className="px-(--card-spacing) pb-2 font-semibold">
                  Child
                </th>
                <th scope="col" className="px-2 pb-2 font-semibold">
                  What
                </th>
                <th scope="col" className="px-2 pb-2 font-semibold">
                  Due
                </th>
                <th scope="col" className="px-2 pb-2 text-right font-semibold">
                  Amount
                </th>
                <th scope="col" className="px-(--card-spacing) pb-2">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline border-hairline border-t">
              {items.map((item) => (
                <tr key={key(item)}>
                  <td className="px-(--card-spacing) py-2 font-bold">{item.nickname}</td>
                  <td className="px-2 py-2 font-semibold">
                    <What item={item} />
                  </td>
                  <td className="px-2 py-2 text-ink-2">{formatDay(item.dueOn)}</td>
                  <td className="money px-2 py-2 text-right font-bold">
                    {money(item.amountMinor)}
                  </td>
                  <td className="px-(--card-spacing) py-2 text-right">
                    <HandOverLink item={item} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-hairline md:hidden">
            {items.map((item) => (
              <li
                key={key(item)}
                className="grid gap-3 px-(--card-spacing) py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-bold">{item.nickname}</span>
                    <span className="block font-semibold text-sm">
                      <What item={item} />
                    </span>
                    <span className="block text-ink-2 text-sm">Due {formatDay(item.dueOn)}</span>
                  </span>
                  <span className="money font-bold">{money(item.amountMinor)}</span>
                </div>
                <HandOverLink item={item} size="lg" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}
