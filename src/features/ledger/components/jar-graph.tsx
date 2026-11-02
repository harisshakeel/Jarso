"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CoachFigure, CoachSays, coachIdFor } from "@/components/brand";
import { cn, formatMoney } from "@/lib";
import {
  type BalanceHistory,
  type BalancePoint,
  type GraphPeriod,
  graphCaption,
  graphPeriods,
  lastDays,
  riderTrack,
} from "../balance-history";

// The drawing box. Text and marks are in these units; the SVG scales to its column.
/** The ride starts after the track has drawn, and lasts about a second. */
const RIDE_DELAY_MS = 900;
const RIDE_MS = 1000;

const W = 360;
const H = 210;
const PAD = { top: 40, right: 16, bottom: 30, left: 46 };
const PLOT = { x: PAD.left, y: PAD.top, w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };
const GROUND = PLOT.y + PLOT.h + 3;

/** The same coach every time, so the ride is theirs. */
const RIDER_KEY = "jar-graph";

type Series = "spend" | "save";
const SERIES: { key: Series; name: string; line: string; post: string }[] = [
  {
    key: "spend",
    name: "Spend",
    line: "stroke-teal-600 dark:stroke-teal-300",
    post: "stroke-teal-600/40 dark:stroke-teal-300/40",
  },
  { key: "save", name: "Save", line: "stroke-gold", post: "stroke-gold/50" },
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

/** A round top for the picture: 1, 2, 5 × 10ⁿ in whole currency units, above the highest point. */
function niceTop(maxMinor: number): number {
  const rough = Math.max(100, maxMinor / 3);
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = [1, 2, 5, 10].find((u) => u * power >= rough) ?? 10;
  const step = unit * power;
  return Math.max(step, Math.ceil(maxMinor / step) * step);
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

/** A gold coin on the track, as the mark draws them, with a card ring so it reads over the line. */
function Coin({ cx, cy, big }: { cx: number; cy: number; big: boolean }) {
  const size = big ? 7 : 5;
  return (
    <g>
      <circle cx={cx} cy={cy} r={size + 2} className="fill-card" />
      <circle
        cx={cx}
        cy={cy}
        r={size}
        strokeWidth={1.5}
        className="fill-gold stroke-teal-800 transition-[r] duration-150"
      />
    </g>
  );
}

type JarGraphProps = {
  history: BalanceHistory;
  currency: string;
  /** The heading; a parent's view names the child ("How Maya's jars moved"). */
  title?: string;
  /** Parents see exact amounts ("always"); the child sees "£5" for whole amounts. */
  showMinor?: "always" | "nonzero";
};

/**
 * Your money ride (child Home): Spend and Save as two rollercoaster tracks over this week, this
 * month or 3 months, ending at today's balances. Height is the amount, left to right is days.
 * Posts hold the tracks up, flags along the ground name the days, a coin sits on the track each
 * day money moved, and the child's coach rides a cart on the track that moved most, parked at
 * today. The tracks draw in and the cart rides once when the picture or its period appears.
 * Point, tap or use the arrow keys to read a day: a hairline finds it and a card gives both jars'
 * figures. The coach says what climbed and what dipped; "See the numbers" lists the figures.
 */
export function JarGraph({
  history,
  currency,
  title = "Your money ride",
  showMinor = "nonzero",
}: JarGraphProps) {
  const id = useId();
  const [days, setDays] = useState<GraphPeriod>(7);
  const [active, setActive] = useState<number | null>(null);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor });
  const period = graphPeriods.find((p) => p.days === days) ?? graphPeriods[0];
  const coach = coachIdFor(RIDER_KEY);

  const view = useMemo(() => lastDays(history, days), [history, days]);
  const { points } = view;
  const moved = new Set(view.movedOn);
  const top = niceTop(Math.max(100, ...points.flatMap((p) => [p.spend, p.save])));
  const x = (index: number) =>
    PLOT.x + (points.length < 2 ? PLOT.w / 2 : (index / (points.length - 1)) * PLOT.w);
  const y = (minor: number) => PLOT.y + PLOT.h - (Math.max(0, minor) / top) * PLOT.h;
  const tracks = SERIES.map((series) => ({
    ...series,
    path: smoothPath(
      points.map((_, index) => x(index)),
      points.map((p) => y(p[series.key])),
    ),
  }));
  // Posts hold each track up every day or two; flags name a handful of days, today always.
  const postEvery = Math.max(1, Math.ceil(points.length / 8));
  const tickEvery = Math.max(1, Math.ceil(points.length / 4));
  const flags = points
    .map((p, index) => ({ p, index }))
    .filter(({ index }) => (points.length - 1 - index) % tickEvery === 0);
  const rider = riderTrack(points);
  const last = points.length - 1;
  const cart = last >= 0 ? { x: x(last), y: y(points[last]?.[rider] ?? 0) } : null;
  const svgRef = useRef<SVGSVGElement>(null);
  const cartRef = useRef<SVGGElement>(null);
  const cartX = cart ? r(cart.x) : 0;
  const cartY = cart ? r(cart.y) : 0;

  // One ride when the picture appears or the period changes: the cart runs its track from the
  // first day to today over a second, after the track has drawn, then parks at today's point.
  // Done in script along the drawn path, because motion paths on SVG groups are not reliable
  // across browsers. Reduced motion, or no path geometry (tests), parks it at once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a period change restarts the ride
  useEffect(() => {
    const cartEl = cartRef.current;
    const track = svgRef.current?.querySelector<SVGPathElement>(`path[data-track="${rider}"]`);
    if (!cartEl) return;
    const park = () => cartEl.setAttribute("transform", `translate(${cartX} ${cartY})`);
    const still =
      typeof window === "undefined" ||
      (typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) ||
      !track ||
      typeof track.getTotalLength !== "function";
    if (still || !track) {
      park();
      return;
    }
    const total = track.getTotalLength();
    if (!total) {
      park();
      return;
    }
    const start = performance.now() + RIDE_DELAY_MS;
    const ease = (t: number) => 1 - (1 - t) ** 3;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / RIDE_MS));
      const at = track.getPointAtLength(total * ease(t));
      cartEl.setAttribute("transform", `translate(${r(at.x)} ${r(at.y)})`);
      if (t < 1) frame = requestAnimationFrame(step);
      else park();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [days, rider, cartX, cartY]);
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
          {graphPeriods.map((option) => (
            <button
              key={option.days}
              type="button"
              aria-pressed={days === option.days}
              onClick={() => {
                setDays(option.days);
                setActive(null);
              }}
              className={cn(
                "min-h-9 rounded-full px-3 font-semibold text-sm transition-colors",
                days === option.days
                  ? "bg-card text-foreground shadow-rest"
                  : "text-ink-2 hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      </div>

      <ul aria-label="Tracks" className="flex gap-4 text-sm">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2 font-semibold">
            <svg aria-hidden viewBox="0 0 20 8" className="h-2 w-5">
              <path d="M1 4 H19" strokeWidth={4} strokeLinecap="round" className={series.line} />
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
          ref={svgRef}
          aria-hidden
          viewBox={`0 0 ${W} ${H}`}
          onPointerMove={nearest}
          onPointerDown={nearest}
          onPointerLeave={() => setActive(null)}
          className="h-auto w-full touch-pan-y select-none overflow-visible"
        >
          {/* Two money marks: the top of the ride and the ground. */}
          {[top, 0].map((value) => (
            <text
              key={value}
              x={PLOT.x - 8}
              y={y(value) + 4}
              textAnchor="end"
              fontSize={11}
              fontWeight={700}
              className="fill-muted-foreground"
            >
              {money(value)}
            </text>
          ))}
          {/* The ground, and a flag for each named day. */}
          <line
            x1={PLOT.x - 6}
            x2={PLOT.x + PLOT.w + 6}
            y1={GROUND}
            y2={GROUND}
            strokeWidth={2}
            strokeLinecap="round"
            className="stroke-hairline-strong"
          />
          {flags.map(({ p, index }) => (
            <g key={p.date}>
              <line
                x1={x(index)}
                x2={x(index)}
                y1={GROUND}
                y2={GROUND + 9}
                strokeWidth={1.5}
                className="stroke-muted-foreground"
              />
              <path
                d={`M${x(index)} ${GROUND + 1} h7 l-2 2.5 l2 2.5 h-7 Z`}
                className="fill-teal-300 dark:fill-teal-400"
              />
              <text
                x={x(index)}
                y={H - 4}
                textAnchor={index === 0 ? "start" : index === last ? "end" : "middle"}
                fontSize={10}
                fontWeight={600}
                className="fill-muted-foreground"
              >
                {showDate(p.date).slice(4)}
              </text>
            </g>
          ))}
          <g key={days}>
            {/* Posts under each track, then the tracks, then the coins. */}
            {tracks.map((track) =>
              points.map((p, index) =>
                index % postEvery === 0 || index === last ? (
                  <line
                    key={`${track.key}-post-${p.date}`}
                    x1={x(index)}
                    x2={x(index)}
                    y1={y(p[track.key])}
                    y2={GROUND}
                    strokeWidth={2}
                    strokeLinecap="round"
                    className={track.post}
                  />
                ) : null,
              ),
            )}
            {tracks.map((track) => (
              <path
                data-track={track.key}
                key={track.key}
                d={track.path}
                fill="none"
                strokeWidth={6}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className={cn(
                  track.line,
                  "motion-safe:animate-[graph-draw_900ms_var(--ease-brand)_both]",
                )}
              />
            ))}
            {points.map((p, index) =>
              moved.has(p.date) || index === active
                ? SERIES.map((series) => (
                    <Coin
                      key={`${series.key}-${p.date}`}
                      cx={x(index)}
                      cy={y(p[series.key])}
                      big={index === active}
                    />
                  ))
                : null,
            )}
            {cart ? (
              <g
                ref={cartRef}
                data-rider={rider}
                className="coaster-cart"
                transform={`translate(${cartX} ${cartY})`}
              >
                {/* The coach sits in the cart; the cart's body covers their legs. */}
                <g transform="translate(-9 -36)">
                  <CoachFigure coach={coach} size={30} />
                </g>
                <rect
                  x={-14}
                  y={-15}
                  width={28}
                  height={14}
                  rx={5}
                  className="fill-teal-800 dark:fill-teal-200"
                />
                <line
                  x1={-9}
                  x2={9}
                  y1={-17}
                  y2={-17}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  className="stroke-teal-800 dark:stroke-teal-200"
                />
                {[-8, 8].map((wheel) => (
                  <circle
                    key={wheel}
                    cx={wheel}
                    cy={-1}
                    r={3.5}
                    strokeWidth={1.5}
                    className="fill-card stroke-teal-800 dark:stroke-teal-200"
                  />
                ))}
              </g>
            ) : null}
          </g>
          {current && active !== null ? (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PLOT.y - 6}
              y2={GROUND}
              strokeWidth={1}
              strokeDasharray="3 3"
              className="stroke-foreground/50"
            />
          ) : null}
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
                    strokeWidth={4}
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

      <CoachSays
        coach={coach}
        says={graphCaption(points, view.movedOn.length > 0, money, period.word)}
        size="sm"
      />

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
              .filter((p, index) => moved.has(p.date) || index === last)
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
