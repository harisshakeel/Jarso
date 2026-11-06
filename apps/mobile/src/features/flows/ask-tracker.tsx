import type { TrackerStep } from "@jarso/core/requests";
import { View } from "react-native";
import { Text } from "@/components/ui";
import { cn, useTokens } from "@/lib";
import { pictureIcon } from "./icons";

/** Done, now, next: a vertical tracker like a delivery. The step in progress is announced. */
export function AskTracker({ steps }: { steps: TrackerStep[] }) {
  const tokens = useTokens();
  const Check = pictureIcon("check");
  return (
    <View className="gap-4 rounded-xl border border-border bg-card p-4">
      {steps.map((step) => (
        <View
          key={step.title}
          testID={`tracker-step-${step.state}`}
          accessible
          accessibilityLabel={
            step.state === "now"
              ? `Now: ${step.title}`
              : step.state === "done"
                ? `Done: ${step.title}`
                : `Next: ${step.title}`
          }
          accessibilityLiveRegion={step.state === "now" ? "polite" : "none"}
          className="flex-row items-center gap-3"
        >
          <View
            className={cn(
              "size-8 items-center justify-center rounded-full",
              step.state === "done" && "bg-success",
              step.state === "now" && "border-4 border-gold bg-card",
              step.state === "next" && "border-2 border-hairline-strong",
            )}
          >
            {step.state === "done" ? (
              <Check size={18} color={tokens["success-foreground"]} />
            ) : step.state === "now" ? (
              <View className="size-3 rounded-full bg-gold" />
            ) : null}
          </View>
          <View className="flex-1">
            <Text
              className={cn("font-sans-bold", step.state === "next" && "text-muted-foreground")}
            >
              {step.title}
            </Text>
            {step.sub ? <Text className="text-small text-muted-foreground">{step.sub}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
