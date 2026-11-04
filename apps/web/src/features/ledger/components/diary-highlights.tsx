import { type DiaryHighlights, diaryHighlightsCopy } from "@jarso/core/ledger";
import { CoinsIcon, ShoppingBagIcon, TagIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn, formatMoney } from "@/lib";

function Tile({
  icon,
  tint,
  label,
  children,
}: {
  icon: ReactNode;
  tint: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-rest">
      <span
        aria-hidden
        className={cn("grid size-11 shrink-0 place-items-center rounded-full", tint)}
      >
        {icon}
      </span>
      <span className="grid min-w-0">
        <span className="text-ink-2">{label}</span>
        <span className="truncate font-extrabold text-money">{children}</span>
      </span>
    </li>
  );
}

/**
 * The diary's highlights (2026-11-04), above the history: this week's spending, the money that
 * came in, and what most of it went on, three figures read at a glance. No judging, no percent.
 */
export function DiaryHighlightsStrip({
  view,
  currency,
}: {
  view: DiaryHighlights;
  currency: string;
}) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  return (
    <section aria-labelledby="diary-highlights-title" className="grid gap-2">
      <h2 id="diary-highlights-title" className="eyebrow">
        {diaryHighlightsCopy.heading}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        <Tile
          icon={<ShoppingBagIcon className="size-5" />}
          tint="bg-teal-100 text-teal-800"
          label={diaryHighlightsCopy.spent}
        >
          <span className="money">{money(view.spentMinor)}</span>
        </Tile>
        <Tile
          icon={<CoinsIcon className="size-5" />}
          tint="bg-gold-100 text-gold-700"
          label={diaryHighlightsCopy.got}
        >
          <span className="money">{money(view.inMinor)}</span>
        </Tile>
        <Tile
          icon={<TagIcon className="size-5" />}
          tint="bg-cyan-100 text-cyan-700"
          label={diaryHighlightsCopy.mostOn}
        >
          {view.top ? (
            <>
              <span aria-hidden>{view.top.emoji}</span> {view.top.label}{" "}
              <span className="money font-bold text-ink-2 text-base">
                {money(view.top.totalMinor)}
              </span>
            </>
          ) : (
            <span className="font-bold text-ink-2 text-base">{diaryHighlightsCopy.nothingYet}</span>
          )}
        </Tile>
      </ul>
    </section>
  );
}
