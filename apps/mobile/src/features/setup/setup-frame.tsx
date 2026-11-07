import { PARENT_STEPS, type ParentStep, parentStepNumber, setupFlowCopy } from "@jarso/core/setup";
import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardScrollView } from "@/components/screen";
import { Button, Text } from "@/components/ui";
import { cn } from "@/lib";

type SetupFrameProps = {
  step: ParentStep;
  /** Shown as Back on the left of the dots. */
  onBack?: () => void;
  /** Shown as Skip on the right of the dots. */
  onSkip?: () => void;
  /** Pinned under the scrolling body (the step's main button). */
  footer?: ReactNode;
  children: ReactNode;
};

/** One onboarding screen for the parent: Back, the seven step dots and Skip, a body and a footer. */
export function SetupFrame({ step, onBack, onSkip, footer, children }: SetupFrameProps) {
  const n = parentStepNumber(step);
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="min-h-12 flex-row items-center justify-between px-2 pt-2">
        <View className="w-20 items-start">
          {onBack ? (
            <Button
              variant="ghost"
              size="sm"
              accessibilityLabel={setupFlowCopy.back}
              onPress={onBack}
            >
              <Text>{setupFlowCopy.back}</Text>
            </Button>
          ) : null}
        </View>
        <View
          accessible
          accessibilityLabel={setupFlowCopy.stepLabel(n, PARENT_STEPS.length)}
          className="flex-row items-center gap-1.5"
        >
          {PARENT_STEPS.map((s, i) => (
            <View
              key={s}
              className={cn(
                "h-2 rounded-full",
                i + 1 === n ? "w-6" : "w-2",
                i + 1 <= n ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </View>
        <View className="w-20 items-end">
          {onSkip ? (
            <Button
              variant="ghost"
              size="sm"
              accessibilityLabel={setupFlowCopy.skip}
              onPress={onSkip}
            >
              <Text>{setupFlowCopy.skip}</Text>
            </Button>
          ) : null}
        </View>
      </View>
      <KeyboardScrollView contentContainerClassName="grow gap-6 px-6 py-6">
        {children}
      </KeyboardScrollView>
      {footer ? <View className="gap-2 px-6 pb-4">{footer}</View> : null}
    </SafeAreaView>
  );
}

/** A step's heading and its one line under it. */
export function StepHeading({ title, line }: { title: string; line?: string }) {
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="font-sans-extrabold text-h1">
        {title}
      </Text>
      {line ? <Text className="text-ink-2">{line}</Text> : null}
    </View>
  );
}
