import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib";

/** A screen's title, with an optional muted line over it (the date) and something beside it. */
export function ScreenHeader({
  overline,
  title,
  size = "h1",
  trailing,
}: {
  overline?: string;
  title: string;
  size?: "display" | "h1";
  trailing?: ReactNode;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        {overline ? (
          <Text className="font-sans-semibold text-small text-muted-foreground">{overline}</Text>
        ) : null}
        <Text
          accessibilityRole="header"
          className={cn("font-sans-extrabold", size === "display" ? "text-display" : "text-h1")}
        >
          {title}
        </Text>
      </View>
      {trailing}
    </View>
  );
}
