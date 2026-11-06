import { type ReactNode, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { OnboardingFlow } from "./onboarding-flow";
import { useOnboardingGate } from "./use-onboarding";

/**
 * On a child's first open, the intro instead of the tabs, so nothing behind it (the daily
 * check-in on Home) can open first. Then the tabs. A tour that can't be read shows the tabs.
 */
export function OnboardingGate({ userId, children }: { userId: string; children: ReactNode }) {
  const gate = useOnboardingGate(userId);
  const [done, setDone] = useState(false);

  if (done || gate === "skip") return <>{children}</>;
  if (gate === "wait") {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  return <OnboardingFlow onDone={() => setDone(true)} />;
}
