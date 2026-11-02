import { cn } from "cn";
import Image from "next/image";

type JarsoWordmarkProps = {
  /** Rendered width in px; height follows the 3:1 artwork. */
  width?: number;
  priority?: boolean;
  className?: string;
};

/**
 * The "jarso" wordmark (design.md §1). There are two artworks, both opaque: the light one on a
 * near-white background for `bg-card` in light mode, the dark one on near-black (#10191C) for dark
 * mode, where it sits as a rounded tile because no dark token matches its background. The `.dark`
 * class picks one; never place either on paper, teal or gold.
 */
export function JarsoWordmark({ width = 288, priority, className }: JarsoWordmarkProps) {
  const height = Math.round((width * 724) / 2172);
  // Two candidate LCP images, so load eagerly instead of preloading both (next/image docs).
  const loading = priority ? "eager" : undefined;
  return (
    <>
      <Image
        src="/brand/jarso-wordmark-864.png"
        width={width}
        height={height}
        alt="Jarso"
        loading={loading}
        // Served as the lossless 864 px PNGs: lossy re-encoding tints the flat background
        // into a visible box.
        unoptimized
        className={cn("h-auto select-none dark:hidden", className)}
      />
      <Image
        src="/brand/jarso-wordmark-dark-864.png"
        width={width}
        height={height}
        alt="Jarso"
        loading={loading}
        unoptimized
        className={cn("hidden h-auto select-none rounded-2xl dark:block", className)}
      />
    </>
  );
}
