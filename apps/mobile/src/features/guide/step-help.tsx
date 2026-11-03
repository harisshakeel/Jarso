import { type GuideContextRef, guideUi } from "@jarso/core/guide";
import { useRouter } from "expo-router";
import { SparklesIcon } from "lucide-react-native";
import { Button, Text } from "@/components/ui";
import { useCurrentStep } from "@/features/learning";
import { useTokens } from "@/lib";

/**
 * "Help me" beside a step, or "Why?" once it is answered (the web's StepGuide). Rendered by the
 * mission player as its step aside; it reads the step from the player's context, by key only,
 * and opens a fresh chat about it in the guide sheet.
 */
export function StepHelp() {
  const router = useRouter();
  const tokens = useTokens();
  const step = useCurrentStep();
  if (!step || step.source === "check-in") return null;
  const ref = {
    source: step.source,
    missionKey: step.missionKey,
    stepKey: step.stepKey,
    phase: step.phase,
  } as const;
  const context: GuideContextRef = step.answered
    ? { entry: "why", ...ref, answer: step.answer }
    : { entry: "step", ...ref, wrongTries: step.wrongTries };
  const label = step.answered ? guideUi.why : guideUi.helpMe;
  return (
    <Button
      variant="outline"
      accessibilityLabel={label}
      onPress={() => openGuideSheet(router, context)}
    >
      <SparklesIcon size={18} color={tokens.foreground} />
      <Text>{label}</Text>
    </Button>
  );
}

/** Opens the guide sheet about `context` (a step, its "Why?", or a topic). */
export function openGuideSheet(
  router: ReturnType<typeof useRouter>,
  context: GuideContextRef,
): void {
  router.push({ pathname: "/(child)/guide-sheet", params: { context: JSON.stringify(context) } });
}
