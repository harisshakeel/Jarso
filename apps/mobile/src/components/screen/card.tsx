import { View, type ViewProps } from "react-native";
import { cn } from "@/lib";

/**
 * The calm card (spec §9, mockup B): 16 / 14 dp padding, hairline border, 12 dp gaps, and the
 * web card's corners (about 20 dp, design.md §4).
 */
export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View
      className={cn("gap-3 rounded-xl border border-border bg-card px-4 py-3.5", className)}
      {...props}
    />
  );
}

/** A hairline between rows of a card. Decoration only, hidden from screen readers. */
export function CardSeparator() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-px bg-border"
    />
  );
}
