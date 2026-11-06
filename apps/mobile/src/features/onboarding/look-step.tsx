import { DEFAULT_LOOK, type JarsoLook } from "@jarso/core/mascot";
import { onboardingCopy } from "@jarso/core/onboarding";
import { useState } from "react";
import { Button, Text } from "@/components/ui";
import { LookPicker, useProgress, useSetJarsoLook } from "@/features/progress";
import { OnboardingFrame } from "./onboarding-frame";

type LookStepProps = { onNext: () => void; onSkip: () => void };

/** Make Jarso yours: plan 6's picker; the look is saved when it changed. */
export function LookStep({ onNext, onSkip }: LookStepProps) {
  const progress = useProgress();
  const setLook = useSetJarsoLook();
  const saved = progress.data?.look ?? DEFAULT_LOOK;
  const [picked, setPicked] = useState<JarsoLook | null>(null);
  const value = picked ?? saved;

  const done = () => {
    if (picked && (picked.lid !== saved.lid || picked.wear !== saved.wear)) setLook.mutate(picked);
    onNext();
  };

  return (
    <OnboardingFrame
      step="look"
      onSkip={onSkip}
      footer={
        <Button variant="keycap-gold" size="lg" onPress={done}>
          <Text>{onboardingCopy.look.done}</Text>
        </Button>
      }
    >
      <Text accessibilityRole="header" className="font-sans-extrabold text-h1">
        {onboardingCopy.look.heading}
      </Text>
      <LookPicker level={progress.data?.level ?? 1} value={value} onChange={setPicked} />
    </OnboardingFrame>
  );
}
