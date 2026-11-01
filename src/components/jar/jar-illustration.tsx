"use client";

import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { JAR_OUTLINE_D } from "@/components/brand";
import { cn } from "@/lib";

type JarIllustrationProps = {
  jar: "spend" | "save";
  /** What a full jar holds, in minor units: the goal's price, or the shared scale. */
  capacityMinor: number;
  /** Money that counts (for Save: Save less what is waiting to come out). */
  filledMinor: number;
  /** Money waiting to come out, drawn as a hatched band above the fill. */
  reservedMinor?: number;
  /** With a goal, the top of the jar is the goal line. */
  goal?: { emoji: string } | null;
  /** Money that is due, drawn as a dashed coin beside the lid, never inside the jar. */
  dueCoin?: string | null;
  size?: "sm" | "lg";
};

// The mark's artwork is 512 × 512 (components/brand/jar-outline.ts). The stroke is 64 wide, so the
// inside of the jar starts 32 in from the outline; the top of a full jar sits where the left wall
// has straightened out under its curl, leaving the lid clear.
const INNER = { x: 120, top: 176, width: 266, bottom: 386 };
const INNER_HEIGHT = INNER.bottom - INNER.top;
const LID = { x: 96, y: 58, width: 262, height: 62 };
const LID_COIN = { x: 414, y: 88 };

const round = (value: number) => Math.round(value * 1000) / 1000;

/** A coin as the mark draws it: gold on a teal rim. */
function Coin({
  x,
  y,
  className,
  style,
}: {
  x: number;
  y: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <g transform={`translate(${x} ${y})`} className={className} style={style}>
      <ellipse cy={7} rx={50} ry={18} className="fill-teal-800" />
      <ellipse rx={50} ry={18} className="fill-gold" />
    </g>
  );
}

/**
 * The jar from the Jarso mark, drawn from the mark's own geometry: its cyan lid, its one teal
 * stroke, and a fill that rises to the share of `capacityMinor`. Decorative only: every amount is
 * also written next to it in text.
 */
export function JarIllustration({
  jar,
  capacityMinor,
  filledMinor,
  reservedMinor = 0,
  goal = null,
  dueCoin = null,
  size = "lg",
}: JarIllustrationProps) {
  const id = useId();
  const clipId = `${id}-inside`;
  const hatchId = `${id}-hatch`;
  const capacity = Math.max(capacityMinor, 1);
  const fill = round(Math.min(Math.max(filledMinor, 0) / capacity, 1));
  // Money arriving (a handover confirmed, a put-in landing) drops two coins into the jar once
  // (design.md §8). The first paint and money leaving draw nothing extra.
  const previous = useRef(filledMinor);
  const [drop, setDrop] = useState(0);
  useEffect(() => {
    if (filledMinor > previous.current) setDrop((n) => n + 1);
    previous.current = filledMinor;
  }, [filledMinor]);
  const reserved = round(Math.min(Math.max(reservedMinor, 0) / capacity, 1 - fill));
  const fillHeight = fill * INNER_HEIGHT;
  const reservedHeight = reserved * INNER_HEIGHT;
  const grow =
    "transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none";

  return (
    <svg
      aria-hidden="true"
      viewBox="24 40 464 420"
      className={cn(size === "lg" ? "h-56 w-auto" : "h-28 w-auto", "overflow-visible")}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={INNER.x} y={INNER.top} width={INNER.width} height={INNER_HEIGHT} rx="14" />
        </clipPath>
        {reserved > 0 ? (
          <pattern
            id={hatchId}
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="16" height="16" className="fill-gold/30" />
            <rect width="6" height="16" className="fill-gold-400" />
          </pattern>
        ) : null}
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect
          data-fill
          data-ratio={fill}
          x={INNER.x}
          y={INNER.bottom - fillHeight}
          width={INNER.width}
          height={fillHeight}
          className={cn(jar === "spend" ? "fill-teal-500" : "fill-gold", grow)}
        />
        {reserved > 0 ? (
          <rect
            data-reserved
            data-ratio={reserved}
            x={INNER.x}
            y={INNER.bottom - fillHeight - reservedHeight}
            width={INNER.width}
            height={reservedHeight}
            fill={`url(#${hatchId})`}
            className={grow}
          />
        ) : null}
      </g>
      {drop > 0 ? (
        <g key={drop} data-coins aria-hidden>
          {[200, 312].map((x, index) => (
            <Coin
              key={x}
              x={x}
              y={INNER.bottom - fillHeight - 22}
              className={cn(
                "motion-reduce:hidden",
                "motion-safe:animate-[coin-drop_500ms_var(--ease-brand)_both]",
              )}
              style={{ animationDelay: `${index * 80}ms` }}
            />
          ))}
        </g>
      ) : null}
      <path
        d={JAR_OUTLINE_D}
        fill="none"
        strokeWidth="64"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-teal-600 dark:stroke-teal-300"
      />
      <rect
        x={LID.x}
        y={LID.y}
        width={LID.width}
        height={LID.height}
        rx={LID.height / 2}
        className="fill-cyan-300"
      />
      {goal ? (
        <g data-goal-line>
          <line
            x1={INNER.x - 40}
            y1={INNER.top + 10}
            x2={INNER.x + INNER.width + 40}
            y2={INNER.top + 10}
            strokeWidth="5"
            strokeDasharray="12 10"
            className="stroke-foreground"
          />
          <text x={INNER.x - 96} y={INNER.top + 26} fontSize="44">
            {goal.emoji}
          </text>
        </g>
      ) : null}
      {dueCoin ? (
        <g data-due-coin>
          <ellipse
            cx={LID_COIN.x}
            cy={LID_COIN.y}
            rx="50"
            ry="24"
            fill="none"
            strokeWidth="5"
            strokeDasharray="10 8"
            className="stroke-cyan-700 dark:stroke-cyan-300"
          />
          <text
            x={LID_COIN.x}
            y={LID_COIN.y + 8}
            textAnchor="middle"
            fontSize="24"
            fontWeight="800"
            className="fill-cyan-700 dark:fill-cyan-300"
          >
            {dueCoin}
          </text>
        </g>
      ) : null}
    </svg>
  );
}
