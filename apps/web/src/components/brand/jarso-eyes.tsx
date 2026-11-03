import { cn } from "cn";
import { JAR_OUTLINE_D, JAR_PILE } from "./jar-outline";

export type EyesSize = "sm" | "md" | "lg" | "xl";
/**
 * Where the pupils sit: straight ahead, down toward the composer, wandering, or up at the coins
 * dropping in while Jarso thinks.
 */
export type EyesLook = "ahead" | "down" | "around" | "up";

const px: Record<EyesSize, number> = { sm: 20, md: 28, lg: 64, xl: 112 };

type JarsoEyesProps = {
  size?: EyesSize;
  look?: EyesLook;
  /**
   * Jarso is thinking: the lid tips open, coins drop in and the pile inside grows. A loading
   * state, so the drops may loop (design.md §8); reduced motion keeps the jar still.
   */
  filling?: boolean;
  /** Accessible name. Omit when the jar sits beside visible "Jarso" text (decorative). */
  label?: string;
  className?: string;
};

/** The mark's own coins: the stack of two on the left and the one on the right. */
const RESTING = JAR_PILE.slice(0, 3);
/** The next coins of the mark's pile, which land one by one while Jarso thinks. */
const LANDING = JAR_PILE.slice(3, 7);
/** The coins dropping in, staggered so one lands every 0.7 s and the jar wobbles each time. */
const DROPS = [0, 1];

/** A coin as in the mark: gold with a teal-800 rim. Artwork units. */
function Coin({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy={7} rx={50} ry={18} className="fill-teal-800" />
      <ellipse rx={50} ry={18} className="fill-gold" />
    </g>
  );
}

/**
 * Jarso's face (design.md §1, §7): the official jar mark, drawn from the mark's own geometry
 * (`jar-outline.ts`, the same outline, lid, lid coin and coins as `JarArt`), with two eyes
 * inside. The eyes blink every few seconds (the one idle loop the app allows, §8); the pupils
 * look ahead, down at the composer, wander, or look up at the coins dropping in while Jarso
 * thinks. Server-safe: CSS does all the moving, and `prefers-reduced-motion` stills it.
 */
export function JarsoEyes({
  size = "md",
  look = "ahead",
  filling = false,
  label,
  className,
}: JarsoEyesProps) {
  const side = px[size];
  return (
    <svg
      viewBox="40 20 440 440"
      width={side}
      height={side}
      data-jarso-eyes={size}
      data-look={look}
      data-filling={filling ? "" : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 select-none overflow-visible", className)}
    >
      <g className="jar-body">
        {RESTING.map(([x, y]) => (
          <Coin key={`${x}-${y}`} x={x} y={y} />
        ))}
        {filling
          ? LANDING.map(([x, y], index) => (
              <g
                key={`${x}-${y}`}
                className="jar-land"
                style={{ animationDelay: `${(index + 1) * 1400}ms` }}
              >
                <Coin x={x} y={y} />
              </g>
            ))
          : null}
        {/* Coins on their way in: under the outline and the eyes, so they fall inside the jar. */}
        {filling
          ? DROPS.map((drop) => (
              <g key={drop} className="jar-drop" style={{ animationDelay: `${drop * 700}ms` }}>
                <Coin x={338} y={0} />
              </g>
            ))
          : null}
        <path
          d={JAR_OUTLINE_D}
          fill="none"
          strokeWidth={64}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-teal-600"
        />
        <g className="jar-lid">
          <rect x={96} y={58} width={262} height={62} rx={31} className="fill-cyan-300" />
        </g>
        <ellipse cx={414} cy={88} rx={44} ry={32} className="fill-gold" />
        <g className="eyes-lids">
          <ellipse
            cx={212}
            cy={258}
            rx={36}
            ry={46}
            fill="#fff"
            strokeWidth={8}
            className="stroke-teal-600"
          />
          <ellipse
            cx={302}
            cy={258}
            rx={36}
            ry={46}
            fill="#fff"
            strokeWidth={8}
            className="stroke-teal-600"
          />
          <g className="eyes-pupils">
            <circle cx={216} cy={264} r={18} fill="var(--color-teal-950)" />
            <circle cx={306} cy={264} r={18} fill="var(--color-teal-950)" />
            <circle cx={223} cy={256} r={6} fill="#fff" />
            <circle cx={313} cy={256} r={6} fill="#fff" />
          </g>
        </g>
      </g>
    </svg>
  );
}
