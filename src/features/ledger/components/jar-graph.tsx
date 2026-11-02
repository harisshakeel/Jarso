"use client";

import { type KeyboardEvent, type PointerEvent, useId, useMemo, useState } from "react";
import { cn, formatMoney } from "@/lib";
import {
  type BalanceHistory,
  type BalancePoint,
  type GraphPeriod,
  graphCaption,
  graphPeriods,
  lastDays,
} from "../balance-history";

// The drawing box. Text and marks are in these units; the SVG scales to its column.
const W = 360;
const H = 200;
const PAD = { top: 14, right: 14, bottom: 26, left: 44 };
const PLOT = { x: PAD.left, y: PAD.top, w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };

type Series = "spend" | "save";
const SERIES: { key: Series; name: string; line: string; fill: string; dot: string }[] = [
  {
    key: "spend",
    name: "Spend",
    line: "stroke-teal-600 dark:stroke-teal-300",
    fill: "fill-teal-600 dark:fill-teal-300",
    dot: "fill-teal-600 dark:fill-teal-300",
  },
  { key: "save", name: "Save", line: "stroke-gold", fill: "fill-gold", dot: "fill-gold" },
];

/** "Fri 30 Oct" for an ISO date; a calendar day, so formatted in UTC. */
function showDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** A round step for the gridlines: 1, 2, 5 × 10ⁿ in whole currency units. */
function niceStep(maxMinor: number, lines: number): number {
  const rough = Math.max(100, maxMinor / lines);
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5, 10].find((u) => u * power >= rough) ?? 10;
  return unit * power;
}

/**
 * A smooth curve through the points (monotone cubic, so it never overshoots a value): the line
 * passes exactly through every day's balance and bends gently between them.
 */
export function smoothPath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) return "";
  if (n === 1) return `M${xs[0]} ${ys[0]}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dxi = (xs[i + 1] as number) - (xs[i] as number);
    dx.push(dxi);
    slope.push(((ys[i + 1] as number) - (ys[i] as number)) / dxi);
  }
  const m: number[] = [slope[0] as number];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1] as number;
    const b = slope[i] as number;
    m.push(a * b <= 0 ? 0 : (a + b) / 2);
  }
  m.push(slope[n - 2] as number);
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i] as number;
    if (s === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] as number) / s;
    const b = (m[i + 1] as number) / s;
    const k = a * a + b * b;
    if (k > 9) {
      const t = 3 / Math.sqrt(k);
      m[i] = t * a * s;
      m[i + 1] = t * b * s;
    }
  }
  let d = `M${xs[0]} ${ys[0]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] as number;
    const x0 = xs[i] as number;
    const x1 = xs[i + 1] as number;
    const y0 = ys[i] as number;
    const y1 = ys[i + 1] as number;
    const c1x = x0 + h / 3;
    const c1y = y0 + ((m[i] as number) * h) / 3;
    const c2x = x1 - h / 3;
    const c2y = y1 - ((m[i + 1] as number) * h) / 3;
    d += ` C${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${r(x1)} ${r(y1)}`;
  }
  return d;
}
const r = (value: number) => Math.round(value * 100) / 100;

type JarGraphProps = {
  history: BalanceHistory;
  currency: string;
  /** The heading; a parent's view names the child ("How Maya's jars moved"). */
  title?: string;
  /** Parents see exact amounts ("always"); the child sees "£5" for whole amounts. */
  showMinor?: "always" | "nonzero";
};

/**
 * How the jars moved (child Home): Spend and Save as two soft lines over the last 7, 30 or 90
 * days, ending at today's balances. Days when money moved carry a coin-sized dot. Point, tap or
 * use the arrow keys to read a day: a hairline finds it and a card gives both jars' figures.
 * Under it, one line says what climbed and what dipped. The figures are also in a plain list.
 */
export function JarGraph({
  history,
  currency,
  title = "How your jars moved",
  showMinor = "nonzero",
}: JarGraphProps) {
  const id = useId();
  const [days, setDays] = useState<GraphPeriod>(30);
  const [active, setActive] = useState<number | null>(null);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor });

  const view = useMemo(() => lastDays(history, days), [history, days]);
  const { points } = view;
  const moved = new Set(view.movedOn);
  const max = Math.max(100, ...points.flatMap((p) => [p.spend, p.save]));
  const step = niceStep(max, 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const x = (index: number) =>
    PLOT.x + (points.length < 2 ? PLOT.w / 2 : (index / (points.length - 1)) * PLOT.w);
  const y = (minor: number) => PLOT.y + PLOT.h - (Math.max(0, minor) / top) * PLOT.h;
  const lines = SERIES.map((series) => {
    const xs = points.map((_, index) => x(index));
    const ys = points.map((p) => y(p[series.key]));
    const path = smoothPath(xs, ys);
    const first = xs[0] ?? PLOT.x;
    const last = xs.at(-1) ?? PLOT.x;
    const area = `${path} L${last} ${PLOT.y + PLOT.h} L${first} ${PLOT.y + PLOT.h} Z`;
    return { ...series, path, area };
  });
  const gridValues = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // A handful of dates along the bottom, the last one always today.
  const tickEvery = Math.max(1, Math.ceil(points.length / 4));
  const ticks = points
    .map((p, index) => ({ p, index }))
    .filter(({ index }) => (points.length - 1 - index) % tickEvery === 0);
  const current: BalancePoint | undefined = active === null ? undefined : points[active];

  function nearest(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const ratio = (px - PLOT.x) / PLOT.w;
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  }
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (points.length === 0) return;
    const at = active ?? points.length - 1;
    const next =
      event.key === "ArrowLeft"
        ? Math.max(0, at - 1)
        : event.key === "ArrowRight"
          ? Math.min(points.length - 1, at + 1)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? points.length - 1
              : event.key === "Escape"
                ? null
                : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
  }

  const tipLeft = current && active !== null ? (x(active) / W) * 100 : 0;
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-h3">
          {title}
        </h2>
        <fieldset className="flex gap-1 rounded-full bg-muted p-1">
          <legend className="sr-only">Show</legend>
          {graphPeriods.map((period) => (
            <button
              key={period.days}
              type="button"
              aria-pressed={days === period.days}
              onClick={() => {
                setDays(period.days);
                setActive(null);
              }}
              className={cn(
                "min-h-9 rounded-full px-3 font-semibold text-sm transition-colors",
                days === period.days
                  ? "bg-card text-foreground shadow-rest"
                  : "text-ink-2 hover:text-foreground",
              )}
            >
              {period.label}
            </button>
          ))}
        </fieldset>
      </div>

      <ul aria-label="Lines" className="flex gap-4 text-sm">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2 font-semibold">
            <svg aria-hidden viewBox="0 0 20 8" className="h-2 w-5">
              <path d="M1 4 H19" strokeWidth={2.5} strokeLinecap="round" className={series.line} />
            </svg>
            {series.name}
          </li>
        ))}
      </ul>

      {/* The keyboard reads the graph from its wrapper: an SVG itself is not focusable. */}
      <div
        role="application"
        aria-label="Spend and Save over time. Use the left and right arrow keys to read each day."
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the wrapper is the keyboard widget
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="relative mx-auto w-full max-w-md rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          onPointerMove={nearest}
          onPointerDown={nearest}
          onPointerLeave={() => setActive(null)}
          className="h-auto w-full touch-pan-y select-none overflow-visible"
        >
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PLOT.x}
                x2={PLOT.x + PLOT.w}
                y1={y(value)}
                y2={y(value)}
                strokeWidth={1}
                className="stroke-hairline-strong"
              />
              <text
                x={PLOT.x - 6}
                y={y(value) + 3.5}
                textAnchor="end"
                fontSize={10}
                className="fill-muted-foreground"
              >
                {money(value)}
              </text>
            </g>
          ))}
          {ticks.map(({ p, index }) => (
            <text
              key={p.date}
              x={x(index)}
              y={H - 8}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              fontSize={10}
              className="fill-muted-foreground"
            >
              {showDate(p.date).slice(4)}
            </text>
          ))}
          {lines.map((series) => (
            <g key={`${series.key}-${days}`}>
              <path d={series.area} className={cn(series.fill, "opacity-10")} />
              <path
                d={series.path}
                fill="none"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className={cn(
                  series.line,
                  "motion-safe:animate-[graph-draw_900ms_var(--ease-brand)_both]",
                )}
              />
            </g>
          ))}
          {current && active !== null ? (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PLOT.y}
              y2={PLOT.y + PLOT.h}
              strokeWidth={1}
              strokeDasharray="3 3"
              className="stroke-foreground/50"
            />
          ) : null}
          {points.map((p, index) =>
            moved.has(p.date) || index === points.length - 1 || index === active
              ? SERIES.map((series) => (
                  <circle
                    key={`${series.key}-${p.date}`}
                    cx={x(index)}
                    cy={y(p[series.key])}
                    r={index === active ? 7 : 5}
                    strokeWidth={2}
                    className={cn(series.dot, "stroke-card transition-[r] duration-150")}
                  />
                ))
              : null,
          )}
        </svg>
        {current ? (
          <div
            role="status"
            className="pointer-events-none absolute top-1 grid min-w-32 -translate-x-1/2 gap-1 rounded-xl bg-card p-3 shadow-raised"
            style={{ left: `clamp(4.5rem, ${tipLeft}%, calc(100% - 4.5rem))` }}
          >
            <p className="font-semibold text-ink-2 text-xs">{showDate(current.date)}</p>
            {SERIES.map((series) => (
              <p key={series.key} className="flex items-center gap-2">
                <svg aria-hidden viewBox="0 0 16 8" className="h-2 w-4">
                  <path
                    d="M1 4 H15"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    className={series.line}
                  />
                </svg>
                <span className="money font-extrabold">{money(current[series.key])}</span>
                <span className="text-ink-2 text-sm">{series.name}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-center text-ink-2">
        {graphCaption(points, view.movedOn.length > 0, money)}
      </p>

      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-2">See the numbers</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-ink-2">
              <th scope="col" className="py-1 font-semibold">
                Day
              </th>
              <th scope="col" className="py-1 font-semibold">
                Spend
              </th>
              <th scope="col" className="py-1 font-semibold">
                Save
              </th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((p, index) => moved.has(p.date) || index === points.length - 1)
              .map((p) => (
                <tr key={p.date} className="border-hairline border-t">
                  <th scope="row" className="py-1 font-normal">
                    {showDate(p.date)}
                  </th>
                  <td className="money py-1">{money(p.spend)}</td>
                  <td className="money py-1">{money(p.save)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
