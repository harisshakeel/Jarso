import { mobileFontSize } from "@jarso/brand/tokens";
import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The phone type scale's names (text-h3, text-body...) are not Tailwind defaults, so without this
// tailwind-merge reads them as colours and a later `text-primary` drops the size.
const merge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: Object.keys(mobileFontSize) }] } },
});

/** Merge class names, later Tailwind classes winning (react-native-reusables' `cn`). */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
