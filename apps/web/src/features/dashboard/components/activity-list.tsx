import type { TaggedItem } from "@jarso/core/dashboard";
import type { Route } from "next";
import Link from "next/link";
import { HistoryList } from "@/features/ledger";
import { ChildChip } from "./series";

/**
 * Recent activity across the family in one list (no "latest" block per child): each line tagged
 * with the child it belongs to. With one child picked, "See all" opens their full history.
 */
export function ActivityList({
  items,
  currency,
  seeAllHref,
  today,
}: {
  items: TaggedItem[];
  currency: string;
  /** The picked child's full history, or null for the family. */
  seeAllHref: Route | null;
  /** The family's today: lines are grouped under "Today", "Yesterday" and the date. */
  today?: string;
}) {
  const owner = new Map(items.map((tag) => [`${tag.item.kind}-${tag.item.id}`, tag]));
  return (
    <div className="grid gap-2">
      <HistoryList
        heading="Recent activity"
        items={items.map((tag) => tag.item)}
        currency={currency}
        skippedLabel="Not given"
        showMinor="always"
        emptyLine="Nothing has moved yet."
        today={today}
        renderTag={(item) => {
          const tag = owner.get(`${item.kind}-${item.id}`);
          return tag ? <ChildChip nickname={tag.nickname} slot={tag.slot} /> : null;
        }}
      />
      {seeAllHref ? (
        <Link
          href={seeAllHref}
          className="inline-flex min-h-11 items-center justify-self-end rounded-full px-2 font-semibold text-primary text-sm underline-offset-4 hover:underline"
        >
          See all history
        </Link>
      ) : null}
    </div>
  );
}
