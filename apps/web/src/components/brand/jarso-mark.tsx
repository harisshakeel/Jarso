import { cn } from "cn";
import Image from "next/image";

type JarsoMarkProps = {
  /** Rendered size in px. design.md §1: never below 24. */
  size?: number;
  /** Accessible name. Omit when the mark sits next to visible "Jarso" text (decorative). */
  label?: string;
  priority?: boolean;
  className?: string;
};

/** The jar mark from public/brand (design.md §1). Never recolour, stretch or filter it. */
export function JarsoMark({ size = 32, label, priority, className }: JarsoMarkProps) {
  const px = Math.max(24, size);
  return (
    <Image
      src="/brand/icons/jarso-mark-192.png"
      width={px}
      height={px}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      priority={priority}
      className={cn("shrink-0 select-none", className)}
    />
  );
}
