"use client";

import { formatDay } from "@jarso/core/allowance";
import type { MoneyChartData } from "@jarso/core/dashboard";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, type PointerEvent, useId, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui";
import { cn, formatMoney } from "@/lib";
import { SeriesDot, seriesOf } from "./series";

const W = 640;
const H = 240;
const PAD = { left: 60, right: 12, top: 28, bottom: 28 };

/** A round top for the axis: 1, 2 or 5 times a power of ten, at or above the value. */
function niceMax(value: number): number {
  if (value <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

type Band = { childId: string; nickname: string; slot: number; jar: "save" | "spend"; d: string };

type MoneyChartProps = {
  chart: MoneyChartData;
  currency: string;
  /** Each child's filter address, so tapping their band or legend key shows only them. */
  hrefs: Record<string, string>;
  /** The chart in words: the caption and what a screen reader hears. */
  sentence: string;
  /** Names either side of the split, e.g. "Last week" / "This week"; null without a split. */
  split: { before: string; now: string } | null;
};

/**
 * Family money over time, stacked by child (spec answer 9): each child's Save underneath, solid
 * in their colour, and Spend on top as stripes of the same colour on a pale ground, one axis, a
 * 2px card-coloured gap between bands. The stripes keep Spend at full colour strength, so every
 * band clears 3:1 on the card, and solid against striped tells the jars apart without leaning on
 * lightness. Hover or touch shows the day's figures; tapping a child's band shows only them.
 * Every figure is also in the caption and the table, so nothing rests on colour alone.
 */
export function MoneyChart({ chart, currency, hrefs, sentence, split }: MoneyChartProps) {
  const router = useRouter();
  const svg = useRef<SVGSVGElement>(null);
  // Pattern ids must be valid in `url(#…)`, so keep only plain characters.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const stripes = (childId: string) => `${uid}-spend-${childId}`;
  const [hover, setHover] = useState<number | null>(null);
  const money = (minor: number) => formatMoney(minor, currency);
  const short = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const n = chart.dates.length;

  const { bands, max, x, y } = useMemo(() => {
    const totals = chart.dates.map((_, i) =>
      chart.series.reduce((sum, s) => sum + (s.save[i] ?? 0) + (s.spend[i] ?? 0), 0),
    );
    const top = niceMax(Math.max(0, ...totals));
    const xOf = (i: number) =>
      n <= 1
        ? (PAD.left + W - PAD.right) / 2
        : PAD.left + (i * (W - PAD.left - PAD.right)) / (n - 1);
    const yOf = (v: number) => PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
    const base = chart.dates.map(() => 0);
    const out: Band[] = [];
    for (const s of chart.series) {
      for (const jar of ["save", "spend"] as const) {
        const lower = [...base];
        const values = s[jar];
        for (let i = 0; i < n; i++) base[i] = (base[i] ?? 0) + Math.max(0, values[i] ?? 0);
        const upperPts = base.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`);
        const lowerPts = lower.map((v, i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).reverse();
        out.push({
          childId: s.childId,
          nickname: s.nickname,
          slot: s.slot,
          jar,
          d: `M${upperPts.join("L")}L${lowerPts.join("L")}Z`,
        });
      }
    }
    return { bands: out, max: top, x: xOf, y: yOf };
  }, [chart, n]);

  if (chart.series.length === 0 || n === 0) {
    return (
      <Card className="shadow-raised">
        <CardContent className="grid gap-2">
          <h2 className="text-h3">Money over time</h2>
          <p className="text-ink-2">No money recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  const splitIndex = chart.splitAt ? chart.dates.indexOf(chart.splitAt) : -1;
  const ticks = [0, max / 2, max];
  const many = chart.series.length > 1;

  function onMove(event: PointerEvent<SVGRectElement>) {
    const box = svg.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const at = ((event.clientX - box.left) / box.width) * W;
    const step = (W - PAD.left - PAD.right) / Math.max(1, n - 1);
    setHover(Math.min(n - 1, Math.max(0, Math.round((at - PAD.left) / step))));
  }

  /** A tap on a child's band shows only that child: find whose band holds the tapped value. */
  function onTap(event: MouseEvent<SVGRectElement>) {
    const box = svg.current?.getBoundingClientRect();
    if (!many || !box || box.height === 0) return;
    const step = (W - PAD.left - PAD.right) / Math.max(1, n - 1);
    const index = Math.min(
      n - 1,
      Math.max(0, Math.round((((event.clientX - box.left) / box.width) * W - PAD.left) / step)),
    );
    const at = ((event.clientY - box.top) / box.height) * H;
    const value = (1 - (at - PAD.top) / (H - PAD.top - PAD.bottom)) * max;
    let below = 0;
    for (const s of chart.series) {
      const above = below + (s.save[index] ?? 0) + (s.spend[index] ?? 0);
      const href = hrefs[s.childId];
      if (value >= below && value <= above && href) {
        router.push(href as Route, { scroll: false });
        return;
      }
      below = above;
    }
  }

  const hoverTotal =
    hover === null
      ? 0
      : chart.series.reduce((sum, s) => sum + (s.save[hover] ?? 0) + (s.spend[hover] ?? 0), 0);

  return (
    <Card className="shadow-raised">
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-h3">Money over time</h2>
          <p className="flex items-center gap-3 text-ink-2 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-[3px] bg-ink-2" />
              Save
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-3 rounded-[3px] bg-[repeating-linear-gradient(45deg,var(--color-ink-2)_0_2px,transparent_2px_4.5px)] bg-ink-2/20"
              />
              Spend
            </span>
          </p>
        </div>
        <p className="sr-only">{sentence}</p>
        <div className="relative">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full touch-pan-y select-none"
            aria-hidden
          >
            <defs>
              {chart.series.map((s) => (
                <pattern
                  key={s.childId}
                  id={stripes(s.childId)}
                  width={7}
                  height={7}
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <rect width={7} height={7} className={seriesOf(s.slot).tint} />
                  <rect width={3} height={7} className={seriesOf(s.slot).fill} />
                </pattern>
              ))}
            </defs>
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className={cn(tick === 0 ? "stroke-hairline-strong" : "stroke-hairline")}
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(tick)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px] tabular-nums"
                >
                  {short(tick)}
                </text>
              </g>
            ))}
            {bands.map((band) => (
              <path
                key={`${band.childId}-${band.jar}`}
                d={band.d}
                // Spend's fill is its stripe pattern, set as an attribute: a fill class would win.
                fill={band.jar === "spend" ? `url(#${stripes(band.childId)})` : undefined}
                className={cn("stroke-card", band.jar === "save" && seriesOf(band.slot).fill)}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            ))}
            {splitIndex > 0 && split ? (
              <g>
                <line
                  x1={x(splitIndex)}
                  x2={x(splitIndex)}
                  y1={PAD.top - 8}
                  y2={H - PAD.bottom}
                  className="stroke-muted-foreground"
                  strokeDasharray="3 4"
                  strokeWidth={1}
                />
                <text
                  x={x(splitIndex) - 6}
                  y={PAD.top - 12}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
                >
                  {split.before}
                </text>
                <text
                  x={x(splitIndex) + 6}
                  y={PAD.top - 12}
                  className="fill-foreground font-semibold text-[11px]"
                >
                  {split.now}
                </text>
              </g>
            ) : null}
            <text x={PAD.left} y={H - 8} className="fill-muted-foreground text-[11px]">
              {formatDay(chart.dates[0] ?? "")}
            </text>
            <text
              x={W - PAD.right}
              y={H - 8}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              Today
            </text>
            {hover !== null ? (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                className="pointer-events-none stroke-foreground"
                strokeWidth={1}
              />
            ) : null}
            {/* One layer for hover and taps, wider than the plot so the edges are easy to reach. */}
            {/* biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; the legend links and the table give keyboards the same */}
            <rect
              x={PAD.left - 8}
              y={PAD.top}
              width={W - PAD.left - PAD.right + 16}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              className={cn(many && "cursor-pointer")}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
              onClick={onTap}
            />
          </svg>
          {hover !== null ? (
            <div
              role="presentation"
              className="pointer-events-none absolute top-0 z-10 grid w-max min-w-40 gap-1 rounded-lg bg-popover p-3 text-popover-foreground text-sm shadow-raised"
              style={{
                left: `${(x(hover) / W) * 100}%`,
                transform: `translateX(${x(hover) > W / 2 ? "calc(-100% - 12px)" : "12px"})`,
              }}
            >
              <span className="font-bold">
                {hover === n - 1 ? "Today" : formatDay(chart.dates[hover] ?? "")}
              </span>
              {chart.series.map((s) => (
                <span key={s.childId} className="flex items-center gap-2">
                  <SeriesDot slot={s.slot} />
                  <span className="flex-1">{s.nickname}</span>
                  <span className="money font-semibold">
                    {money((s.save[hover] ?? 0) + (s.spend[hover] ?? 0))}
                  </span>
                </span>
              ))}
              {many ? (
                <span className="flex justify-between gap-2 border-hairline border-t pt-1 font-bold">
                  Family
                  <span className="money">{money(hoverTotal)}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {many ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Show only">
            {chart.series.map((s) => (
              <li key={s.childId}>
                <Link
                  href={(hrefs[s.childId] ?? "#") as Route}
                  scroll={false}
                  className="inline-flex min-h-11 items-center gap-2 font-semibold text-sm hover:underline"
                >
                  <SeriesDot slot={s.slot} />
                  {s.nickname} <span className="sr-only">only</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-ink-2 text-sm">{sentence}</p>
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">
            Show the numbers
          </summary>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left tabular-nums">
              <thead>
                <tr className="text-ink-2">
                  <th className="py-1 pr-3 font-semibold">Day</th>
                  {chart.series.map((s) => (
                    <th key={s.childId} className="py-1 pr-3 font-semibold">
                      {s.nickname}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.dates.map((date, i) => (
                  <tr key={date} className="border-hairline border-t">
                    <td className="py-1 pr-3">{formatDay(date)}</td>
                    {chart.series.map((s) => (
                      <td key={s.childId} className="py-1 pr-3">
                        {money((s.save[i] ?? 0) + (s.spend[i] ?? 0))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
