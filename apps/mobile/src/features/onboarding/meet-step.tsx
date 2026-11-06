import { onboardingCopy } from "@jarso/core/onboarding";
import { View } from "react-native";
import { Jarso } from "@/components/brand";
import { Button, Text } from "@/components/ui";
import { OnboardingFrame, Says } from "./onboarding-frame";

type MeetStepProps = { name: string | null; onNext: () => void; onSkip: () => void };

/** Jarso hops in and waves: one line, one question, one big button. */
export function MeetStep({ name, onNext, onSkip }: MeetStepProps) {
  return (
    <OnboardingFrame
      step="meet"
      tone="teal"
      onSkip={onSkip}
      footer={
        <Button variant="keycap-gold" size="xl" onPress={onNext}>
          <Text>{onboardingCopy.meet.go}</Text>
        </Button>
      }
    >
      <View className="flex-1 items-center justify-center gap-4">
        <View className="flex-row">
          <Says>{onboardingCopy.meet.hello(name)}</Says>
        </View>
        <Jarso mood="wave" size={200} fill={0.15} bounce />
        <Text
          accessibilityRole="header"
          className="text-center font-sans-extrabold text-h1 text-white"
        >
          {onboardingCopy.meet.heading}
        </Text>
      </View>
    </OnboardingFrame>
  );
}
