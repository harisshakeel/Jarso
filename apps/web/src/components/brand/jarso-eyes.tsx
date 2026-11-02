import { cn } from "cn";

export type EyesSize = "sm" | "md" | "lg" | "xl";
/**
 * Where the pupils sit: straight ahead, down toward the composer, wandering, or up at the coins
 * dropping into the lid while Jarso thinks.
 */
export type EyesLook = "ahead" | "down" | "around" | "up";

const px: Record<EyesSize, number> = { sm: 20, md: 28, lg: 64, xl: 112 };

type JarsoEyesProps = {
  size?: EyesSize;
  look?: EyesLook;
  /**
   * Jarso is thinking: coins drop through the slot in the lid and the coins inside rise. A
   * loading state, so it may loop (design.md §8); reduced motion keeps the jar still.
   */
  filling?: boolean;
  /** Accessible name. Omit when the jar sits beside visible "Jarso" text (decorative). */
  label?: string;
  className?: string;
};

/** The coins on top of the pile inside, as [cx, cy, rx]: three side by side, one on top. */
const PILE: [number, number, number][] = [
  [18, 49, 6],
  [44, 49, 6.5],
  [31, 48, 6.5],
  [25, 45.4, 5.5],
];

/** The three coins that drop into the lid, staggered so one is always on its way. */
const DROPS = [0, 1, 2];

/**
 * Jarso's face (design.md §7): the brand jar, a teal body under a cyan lid with a coin slot,
 * two white eyes and a few gold coins inside. The eyes blink every few seconds (the one idle
 * loop the app allows, §8); the pupils can look down at the composer, wander, or look up at
 * coins dropping in while Jarso thinks. Server-safe: CSS does all the moving, and
 * `prefers-reduced-motion` stills it.
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
      viewBox="0 0 64 64"
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
      {/* Coins on their way in: drawn under the lid, so they vanish into the slot. */}
      {filling ? (
        <g className="jar-drops">
          {DROPS.map((drop) => (
            <g key={drop} className="jar-drop" style={{ animationDelay: `${drop * 400}ms` }}>
              <ellipse cx="32" cy="6" rx="5" ry="5" fill="var(--gold)" />
              <ellipse cx="32" cy="6" rx="2.6" ry="2.6" fill="none" stroke="#c99a00" />
            </g>
          ))}
        </g>
      ) : null}
      {/* Body: shoulders under the lid, rounded at the foot. */}
      <path
        d="M17 14h30a3 3 0 0 1 3 3v1.5c0 1.6 1.2 2.6 2.6 3.4A8 8 0 0 1 57 29v19a12 12 0 0 1-12 12H19A12 12 0 0 1 7 48V29a8 8 0 0 1 4.4-7.1C12.8 21.1 14 20.1 14 18.5V17a3 3 0 0 1 3-3Z"
        fill="var(--primary)"
      />
      {/* Glass shine down the left side. */}
      <rect x="11" y="27" width="3.2" height="16" rx="1.6" fill="#fff" opacity="0.22" />
      {/* The coins inside: a pile that rises while Jarso thinks. */}
      <g className="jar-pile">
        <path d="M11 49h42a8 7 0 0 1-8 7H19a8 7 0 0 1-8-7Z" fill="var(--gold)" />
        {PILE.map(([cx, cy, rx]) => (
          <g key={`${cx}-${cy}`}>
            <ellipse cx={cx} cy={cy + 1.2} rx={rx} ry="2.2" fill="#c99a00" />
            <ellipse cx={cx} cy={cy} rx={rx} ry="2.2" fill="#ffe462" />
          </g>
        ))}
      </g>
      {/* Lid with its coin slot. */}
      <rect x="9" y="5" width="46" height="10" rx="5" fill="var(--accent)" />
      <rect x="26" y="8.8" width="12" height="2.4" rx="1.2" fill="var(--color-teal-950)" />
      <g className="eyes-lids">
        <ellipse cx="24" cy="32" rx="6.5" ry="8.5" fill="#fff" />
        <ellipse cx="40" cy="32" rx="6.5" ry="8.5" fill="#fff" />
        <g className="eyes-pupils">
          <circle cx="25" cy="33" r="3.2" fill="var(--color-teal-950)" />
          <circle cx="41" cy="33" r="3.2" fill="var(--color-teal-950)" />
          <circle cx="26.2" cy="31.6" r="1" fill="#fff" />
          <circle cx="42.2" cy="31.6" r="1" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}
