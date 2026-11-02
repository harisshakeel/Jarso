"use client";

import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { JAR_OUTLINE_D, JAR_PILE } from "@/components/brand";
import { cn } from "@/lib";

type JarIllustrationProps = {
  jar: "spend" | "save";
  /** What a full jar holds, in minor units: the goal's price, or the shared scale. */
  capacityMinor: number;
  /** Money that counts (for Save: Save less what is waiting to come out). */
  filledMinor: number;
  /** Money waiting to come out, drawn as hatched coins on top of the pile. */
  reservedMinor?: number;
  /** With a goal, the top of the jar is the goal line. */
  goal?: { emoji: string } | null;
  /** Money that is due, drawn as a dashed coin beside the lid, never inside the jar. */
  dueCoin?: string | null;
  size?: "sm" | "lg";
};

// The mark's artwork is 512 × 512 (components/brand/jar-outline.ts): a 64-wide stroke, the lid
// above it, a coin beside the lid, and a pile of coins inside. A full jar is the whole pile.
const LID = { x: 96, y: 58, width: 262, height: 62 };
const LID_COIN = { x: 414, y: 88 };
const PILE_TOP = 176;
const COINS = JAR_PILE.length;

const round = (value: number) => Math.round(value * 1000) / 1000;
/** How many coins stand for a share of the jar: none for nothing, at least one for anything. */
const coinsFor = (share: number, room = COINS) =>
  share <= 0 ? 0 : Math.min(room, Math.max(1, Math.round(share * COINS)));

/** A coin as the mark draws it: gold on a teal rim. `fill` swaps the gold for another paint. */
function Coin({
  x,
  y,
  fill,
  className,
  style,
}: {
  x: number;
  y: number;
  fill?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <g transform={`translate(${x} ${y})`} className={className} style={style}>
      <ellipse cy={7} rx={50} ry={18} className="fill-teal-800" />
      <ellipse rx={50} ry={18} fill={fill} className={fill ? undefined : "fill-gold"} />
    </g>
  );
}

/**
 * The jar from the Jarso mark, drawn from the mark's own geometry: its cyan lid, its one teal
 * stroke, and gold coins piling up to the share of `capacityMinor`. Decorative only: every
 * amount is also written next to it in text.
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
  const hatchId = `${id}-hatch`;
  const capacity = Math.max(capacityMinor, 1);
  const fill = round(Math.min(Math.max(filledMinor, 0) / capacity, 1));
  const reserved = round(Math.min(Math.max(reservedMinor, 0) / capacity, 1 - fill));
  const counted = coinsFor(fill);
  const waiting = coinsFor(reserved, COINS - counted);
  // Money arriving (a handover confirmed, a put-in landing) drops two coins onto the pile once
  // (design.md §8). The first paint and money leaving draw nothing extra.
  const previous = useRef(filledMinor);
  const [drop, setDrop] = useState(0);
  useEffect(() => {
    if (filledMinor > previous.current) setDrop((n) => n + 1);
    previous.current = filledMinor;
  }, [filledMinor]);
  const landing = JAR_PILE.slice(Math.max(0, counted - 2), Math.max(2, counted));

  return (
    <svg
      aria-hidden="true"
      viewBox="24 40 464 420"
      className={cn(size === "lg" ? "h-56 w-auto" : "h-28 w-auto", "overflow-visible")}
      data-jar={jar}
    >
      {waiting > 0 ? (
        <defs>
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
        </defs>
      ) : null}
      <g data-fill data-ratio={fill}>
        {JAR_PILE.slice(0, counted).map(([x, y]) => (
          <Coin key={`${x}-${y}`} x={x} y={y} />
        ))}
      </g>
      {reserved > 0 ? (
        <g data-reserved data-ratio={reserved}>
          {JAR_PILE.slice(counted, counted + waiting).map(([x, y]) => (
            <Coin key={`${x}-${y}`} x={x} y={y} fill={`url(#${hatchId})`} />
          ))}
        </g>
      ) : null}
      {drop > 0 ? (
        <g key={drop} data-coins aria-hidden>
          {landing.map(([x, y], index) => (
            <Coin
              key={`${x}-${y}`}
              x={x}
              y={y}
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
            x1={80}
            y1={PILE_TOP}
            x2={426}
            y2={PILE_TOP}
            strokeWidth="5"
            strokeDasharray="12 10"
            className="stroke-foreground"
          />
          <text x={24} y={PILE_TOP + 16} fontSize="44">
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
