import {
  isPracticeStep,
  ONBOARDING_STEPS,
  type OnboardingStep,
  onboardingCopy,
  stepNumber,
} from "@jarso/core/onboarding";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text } from "@/components/ui";
import { cn } from "@/lib";

type FrameProps = {
  step: OnboardingStep;
  onSkip: () => void;
  /** `teal` for Meet Jarso; the other steps sit on the page colour. */
  tone?: "page" | "teal";
  footer?: ReactNode;
  children: ReactNode;
};

/** One intro screen: the step dots and Skip, the PRACTICE tag on practice steps, a body and a footer. */
export function OnboardingFrame({ step, onSkip, tone = "page", footer, children }: FrameProps) {
  const teal = tone === "teal";
  const n = stepNumber(step);
  return (
    <SafeAreaView className={cn("flex-1", teal ? "bg-teal-700" : "bg-background")}>
      <View className="flex-row items-center justify-between px-4 pt-2">
        <View
          accessible
          accessibilityLabel={onboardingCopy.stepLabel(n, ONBOARDING_STEPS.length)}
          className="flex-row items-center gap-1.5"
        >
          {ONBOARDING_STEPS.map((s, i) => (
            <View
              key={s}
              className={cn(
                "h-2 rounded-full",
                i + 1 === n ? "w-8" : "w-2",
                i + 1 <= n ? (teal ? "bg-white" : "bg-primary") : teal ? "bg-white/30" : "bg-muted",
              )}
            />
          ))}
        </View>
        <Button variant="ghost" size="sm" onPress={onSkip}>
          <Text className={teal ? "text-white" : undefined}>{onboardingCopy.skip}</Text>
        </Button>
      </View>
      {isPracticeStep(step) ? (
        <View
          accessible
          accessibilityLabel={onboardingCopy.practiceLabel}
          className="mt-1 self-center rounded-full bg-grape-600 px-3 py-1"
        >
          <Text className="font-sans-extrabold text-caption tracking-widest text-white">
            {onboardingCopy.practiceTag}
          </Text>
        </View>
      ) : null}
      <ScrollView contentContainerClassName="grow gap-4 px-6 py-4">{children}</ScrollView>
      {footer ? <View className="gap-2 px-6 pb-4">{footer}</View> : null}
    </SafeAreaView>
  );
}

/** Jarso's speech bubble, tail to the left. */
export function Says({ children }: { children: string }) {
  return (
    <View className="flex-1 rounded-3xl rounded-bl-sm bg-card p-3">
      <Text className="font-sans-extrabold text-card-foreground">{children}</Text>
    </View>
  );
}
