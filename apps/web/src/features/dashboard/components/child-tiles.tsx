import type { DashboardChild } from "@jarso/core/dashboard";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { routes } from "@/config";
import { SendNoteSheet } from "@/features/notifications";
import { cn, formatMoney } from "@/lib";
import { seriesOf } from "./series";

/**
 * The children, one compact tile each (spec answer 2: each child on tap): their colour, Spend,
 * Save and goal in a line, opening their page, and a note to send them. The only per-child
 * block on the dashboard.
 */
export function ChildTiles({ items, currency }: { items: DashboardChild[]; currency: string }) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <section aria-labelledby="children-title" className="grid gap-3">
      <h2 id="children-title" className="text-h2">
        Children
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((child) => {
          const view = child.goal;
          const goal = view
            ? view.progress.reached
              ? `${view.goal.emoji} ${view.goal.name}: reached`
              : `${view.goal.emoji} ${view.goal.name}: ${money(view.progress.countedMinor)} of ${money(view.goal.targetMinor)}`
            : "No goal yet";
          const waiting = child.due.length;
          return (
            <li key={child.id}>
              <div className="relative grid h-full gap-2 rounded-xl bg-card p-4 shadow-rest transition-shadow hover:shadow-raised">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full font-extrabold",
                      seriesOf(child.slot).dot,
                      seriesOf(child.slot).ink,
                    )}
                  >
                    {child.nickname.charAt(0).toUpperCase()}
                  </span>
                  <h3 className="min-w-0 flex-1 truncate font-bold text-h3">
                    <Link
                      href={routes.parentChild(child.id)}
                      className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-ring focus-visible:after:-outline-offset-3"
                    >
                      {child.nickname}
                    </Link>
                  </h3>
                  {waiting > 0 ? (
                    <Badge variant="count">
                      {waiting}
                      <span className="sr-only"> due</span>
                    </Badge>
                  ) : null}
                </div>
                <p className="flex flex-wrap gap-x-4">
                  <span>
                    <span className="text-ink-2">Spend </span>
                    <span className="money font-bold">{money(child.spendMinor)}</span>
                  </span>
                  <span>
                    <span className="text-ink-2">Save </span>
                    <span className="money font-bold">{money(child.saveMinor)}</span>
                  </span>
                </p>
                <p className="truncate text-ink-2 text-sm">{goal}</p>
                {/* Above the tile's link layer, so it opens the sheet, not the child's page. */}
                <SendNoteSheet
                  childId={child.id}
                  nickname={child.nickname}
                  className="relative z-10 w-fit"
                />
              </div>
            </li>
          );
        })}
        <li>
          <Link
            href={routes.parentNewChild}
            className="flex h-full min-h-24 items-center justify-center gap-2 rounded-xl border-2 border-hairline-strong border-dashed px-4 font-semibold text-primary hover:bg-card"
          >
            <PlusIcon aria-hidden className="size-5" />
            Add a child
          </Link>
        </li>
      </ul>
    </section>
  );
}
