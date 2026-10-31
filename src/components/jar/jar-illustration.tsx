import { useId } from "react";
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
  /** Money that is due, drawn as a dashed coin above the lid, never inside the jar. */
  dueCoin?: string | null;
  size?: "sm" | "lg";
};

// Inside of the jar in the drawing's coordinates (design.md §7, drawn from the mark).
const INNER = { x: 40, top: 52, width: 120, bottom: 198 };
const INNER_HEIGHT = INNER.bottom - INNER.top;

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The jar from the Jarso mark: a cyan lid, a teal outline, and a fill that rises to the share
 * of `capacityMinor`. Decorative only: every amount is also written next to it in text.
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
  const reserved = round(Math.min(Math.max(reservedMinor, 0) / capacity, 1 - fill));
  const fillHeight = fill * INNER_HEIGHT;
  const reservedHeight = reserved * INNER_HEIGHT;
  const grow =
    "transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none";

  return (
    <svg
      aria-hidden="true"
      viewBox="-20 -24 240 250"
      className={cn(size === "lg" ? "h-56 w-auto" : "h-28 w-auto", "overflow-visible")}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={INNER.x} y={INNER.top} width={INNER.width} height={INNER_HEIGHT} rx="14" />
        </clipPath>
        {reserved > 0 ? (
          <pattern
            id={hatchId}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" className="fill-gold/30" />
            <rect width="3" height="8" className="fill-gold-400" />
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
      <rect x="34" y="14" width="132" height="26" rx="13" className="fill-cyan-300" />
      <path
        d="M62 44 C62 60 30 62 30 96 V180 Q30 206 56 206 H144 Q170 206 170 180 V48"
        fill="none"
        strokeWidth="16"
        strokeLinecap="round"
        className="stroke-teal-600 dark:stroke-teal-300"
      />
      {goal ? (
        <g data-goal-line>
          <line
            x1="22"
            y1={INNER.top + 6}
            x2="178"
            y2={INNER.top + 6}
            strokeWidth="2.5"
            strokeDasharray="6 5"
            className="stroke-foreground"
          />
          <text x="-16" y={INNER.top + 12} fontSize="20">
            {goal.emoji}
          </text>
        </g>
      ) : null}
      {dueCoin ? (
        <g data-due-coin>
          <ellipse
            cx="190"
            cy="0"
            rx="26"
            ry="14"
            fill="none"
            strokeWidth="2.5"
            strokeDasharray="5 4"
            className="stroke-cyan-700 dark:stroke-cyan-300"
          />
          <text
            x="190"
            y="5"
            textAnchor="middle"
            fontSize="13"
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
