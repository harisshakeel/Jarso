import type { Route } from "next";
import Link from "next/link";
import type { ComponentProps } from "react";
import { HistoryList } from "./history-list";

type RecentHistoryProps = ComponentProps<typeof HistoryList> & {
  /** The full history page, linked only when there is more than `limit` to see. */
  seeAllHref: Route;
  limit?: number;
};

/** The newest few history lines, with "See all" when there are more. */
export function RecentHistory({ items, seeAllHref, limit = 5, ...list }: RecentHistoryProps) {
  return (
    <div className="grid gap-3">
      <HistoryList items={items.slice(0, limit)} {...list} />
      {items.length > limit ? (
        <Link
          href={seeAllHref}
          aria-label="See all history"
          className="inline-flex min-h-11 items-center justify-self-end rounded-full px-2 font-semibold text-primary text-sm underline-offset-4 hover:underline"
        >
          See all
        </Link>
      ) : null}
    </div>
  );
}
