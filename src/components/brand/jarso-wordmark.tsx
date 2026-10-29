import { cn } from "cn";
import Image from "next/image";

type JarsoWordmarkProps = {
  /** Rendered width in px; height follows the 3:1 artwork. */
  width?: number;
  priority?: boolean;
  className?: string;
};

/**
 * The "jarso" wordmark (design.md §1). The artwork has an opaque near-white background,
 * so place it on white (`bg-card` in light mode) only: never on paper, teal, gold or dark.
 */
export function JarsoWordmark({ width = 288, priority, className }: JarsoWordmarkProps) {
  return (
    <Image
      src="/brand/jarso-wordmark-864.png"
      width={width}
      height={Math.round((width * 724) / 2172)}
      alt="Jarso"
      priority={priority}
      // Served as the lossless 864 px PNG: lossy re-encoding tints the near-white background
      // into a visible box on white.
      unoptimized
      className={cn("h-auto select-none", className)}
    />
  );
}
