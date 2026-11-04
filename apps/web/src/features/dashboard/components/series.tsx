import { cn } from "@/lib";

type Series = {
  /** Background: dots, avatars, legend keys. */
  dot: string;
  /** SVG fill: the Save band, and the stripes of the Spend band. */
  fill: string;
  /** SVG fill, pale: the ground under the Spend band's stripes. */
  tint: string;
  /** A bar's background. */
  bar: string;
  /** A ring in the colour: round a kid's badge. */
  ring: string;
  /** Text on the colour: white on every step (APCA, checked 2026-11-03). */
  ink: string;
};

/**
 * Each child's colour on the dashboard, by slot (spec answer 9: fixed per child, consistent
 * everywhere on the page). Written out in full so Tailwind sees every class.
 */
export const SERIES: Record<number, Series> = {
  0: {
    dot: "bg-series-0",
    fill: "fill-series-0",
    tint: "fill-series-0/20",
    bar: "bg-series-0",
    ring: "ring-series-0",
    ink: "text-white",
  },
  1: {
    dot: "bg-series-1",
    fill: "fill-series-1",
    tint: "fill-series-1/20",
    bar: "bg-series-1",
    ring: "ring-series-1",
    ink: "text-white",
  },
  2: {
    dot: "bg-series-2",
    fill: "fill-series-2",
    tint: "fill-series-2/20",
    bar: "bg-series-2",
    ring: "ring-series-2",
    ink: "text-white",
  },
  3: {
    dot: "bg-series-3",
    fill: "fill-series-3",
    tint: "fill-series-3/20",
    bar: "bg-series-3",
    ring: "ring-series-3",
    ink: "text-white",
  },
  4: {
    dot: "bg-series-4",
    fill: "fill-series-4",
    tint: "fill-series-4/20",
    bar: "bg-series-4",
    ring: "ring-series-4",
    ink: "text-white",
  },
  5: {
    dot: "bg-series-5",
    fill: "fill-series-5",
    tint: "fill-series-5/20",
    bar: "bg-series-5",
    ring: "ring-series-5",
    ink: "text-white",
  },
  6: {
    dot: "bg-series-6",
    fill: "fill-series-6",
    tint: "fill-series-6/20",
    bar: "bg-series-6",
    ring: "ring-series-6",
    ink: "text-white",
  },
  7: {
    dot: "bg-series-7",
    fill: "fill-series-7",
    tint: "fill-series-7/20",
    bar: "bg-series-7",
    ring: "ring-series-7",
    ink: "text-white",
  },
  8: {
    dot: "bg-series-8",
    fill: "fill-series-8",
    tint: "fill-series-8/20",
    bar: "bg-series-8",
    ring: "ring-series-8",
    ink: "text-white",
  },
};

export function seriesOf(slot: number): Series {
  return SERIES[slot] ?? (SERIES[0] as Series);
}

/** A child's colour dot. Decorative: the name always sits beside it. */
export function SeriesDot({ slot, className }: { slot: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", seriesOf(slot).dot, className)}
    />
  );
}

/** The child's name with their colour, beside a line that belongs to them. */
export function ChildChip({ nickname, slot }: { nickname: string; slot: number }) {
  return (
    <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-semibold text-sm">
      <SeriesDot slot={slot} />
      <span className="truncate">{nickname}</span>
    </span>
  );
}
