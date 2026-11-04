import { View } from "react-native";
import { cn } from "@/lib";

/** A thin progress bar. `value` is a 0–1 ratio and is clamped, so an over-target goal fills it. */
export function ProgressBar({
  value,
  tone = "gold",
  accessibilityLabel,
}: {
  value: number;
  tone?: "gold" | "primary";
  accessibilityLabel: string;
}) {
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const now = Math.round(ratio * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now }}
      className="h-2 overflow-hidden rounded-full bg-muted"
    >
      <View
        className={cn("h-full rounded-full", tone === "gold" ? "bg-gold" : "bg-primary")}
        style={{ width: `${now}%` }}
      />
    </View>
  );
}
