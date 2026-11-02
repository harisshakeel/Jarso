import { cn } from "cn";

export type EyesSize = "sm" | "md" | "lg" | "xl";
/** Where the pupils sit: straight ahead, down toward the composer, or wandering (thinking). */
export type EyesLook = "ahead" | "down" | "around";

const px: Record<EyesSize, number> = { sm: 20, md: 28, lg: 64, xl: 112 };

type JarsoEyesProps = {
  size?: EyesSize;
  look?: EyesLook;
  /** Accessible name. Omit when the eyes sit beside visible "Jarso" text (decorative). */
  label?: string;
  className?: string;
};

/**
 * Jarso's face (design.md §7): a teal rounded tile with two white eyes, nothing else. The eyes
 * blink every few seconds (the one looping idle motion the app allows, §8) and the pupils can
 * look down at the composer or wander while Jarso thinks. Server-safe: CSS does all the moving,
 * and `prefers-reduced-motion` stills it.
 */
export function JarsoEyes({ size = "md", look = "ahead", label, className }: JarsoEyesProps) {
  const side = px[size];
  return (
    <svg
      viewBox="0 0 64 64"
      width={side}
      height={side}
      data-jarso-eyes={size}
      data-look={look}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0 select-none", className)}
    >
      <rect width="64" height="64" rx="18" fill="var(--primary)" />
      <g className="eyes-lids">
        <ellipse cx="22" cy="32" rx="7.5" ry="10" fill="#fff" />
        <ellipse cx="42" cy="32" rx="7.5" ry="10" fill="#fff" />
        <g className="eyes-pupils">
          <circle cx="23" cy="33" r="3.6" fill="var(--color-teal-950)" />
          <circle cx="43" cy="33" r="3.6" fill="var(--color-teal-950)" />
          <circle cx="24.4" cy="31.4" r="1.1" fill="#fff" />
          <circle cx="44.4" cy="31.4" r="1.1" fill="#fff" />
        </g>
      </g>
    </svg>
  );
}
