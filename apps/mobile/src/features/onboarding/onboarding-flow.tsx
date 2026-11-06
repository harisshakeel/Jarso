import {
  nextStep,
  type OnboardingStep,
  onboardingCopy,
  type PracticeJars,
  startPractice,
} from "@jarso/core/onboarding";
import { useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import type { CelebrationChip } from "@/components/celebrate";
import { useCelebrate } from "@/components/celebrate";
import { useHome } from "@/features/jars";
import { useParentLabel, useProgress } from "@/features/progress";
import { useNickname } from "@/features/settings";
import { GoalStep } from "./goal-step";
import { LookStep } from "./look-step";
import { MeetStep } from "./meet-step";
import { OnboardingFrame } from "./onboarding-frame";
import { SaveStep } from "./save-step";
import { SpendStep } from "./spend-step";
import { useFinishOnboarding, useSkipOnboarding } from "./use-onboarding";

/**
 * The child's intro: Meet Jarso, practice Spend and Save, a real goal, make Jarso yours, then the
 * welcome celebration over Home. Skip on any step ends it. Practice money stays in this state.
 */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<OnboardingStep>("meet");
  const [practice, setPractice] = useState<PracticeJars | null>(null);
  const name = useNickname().data ?? null;
  const parent = useParentLabel();
  const currency = useHome().data?.context.currency;
  const progress = useProgress();
  const { finish } = useFinishOnboarding();
  const skipIntro = useSkipOnboarding();
  const celebrate = useCelebrate();
  const closing = useRef(false);

  const skip = () => {
    if (closing.current) return;
    closing.current = true;
    void skipIntro().then(onDone);
  };

  const complete = async () => {
    if (closing.current) return;
    closing.current = true;
    const reward = await finish();
    const copy = onboardingCopy.done;
    // Only what the server says it paid: a replay pays nothing and shows no chips.
    const chips: CelebrationChip[] = [
      ...(reward.sparks > 0 ? [{ icon: "zap" as const, label: copy.sparks(reward.sparks) }] : []),
      ...(reward.badge ? [{ icon: "award" as const, label: copy.badge }] : []),
    ];
    celebrate({
      title: copy.title,
      tone: "grape",
      mood: "cheer",
      look: progress.data?.look,
      chips,
      primary: { label: copy.go },
    });
    onDone();
  };

  const next = () => {
    const after = nextStep(step);
    if (after) setStep(after);
    else void complete();
  };

  if ((step === "spend" || step === "save") && !currency) {
    return (
      <OnboardingFrame step={step} onSkip={skip}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator accessibilityLabel="Loading" />
        </View>
      </OnboardingFrame>
    );
  }

  switch (step) {
    case "meet":
      return <MeetStep name={name} onNext={next} onSkip={skip} />;
    case "spend":
      return (
        <SpendStep
          currency={currency as string}
          onNext={(jars) => {
            setPractice(jars);
            next();
          }}
          onSkip={skip}
        />
      );
    case "save":
      return (
        <SaveStep
          currency={currency as string}
          start={practice ?? startPractice(currency as string)}
          parent={parent}
          onNext={next}
          onSkip={skip}
        />
      );
    case "goal":
      return <GoalStep onNext={next} onSkip={skip} />;
    case "look":
      return <LookStep onNext={next} onSkip={skip} />;
  }
}
