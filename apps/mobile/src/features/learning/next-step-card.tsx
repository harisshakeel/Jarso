import { describeStep, NEXT_STEP_EYEBROW, type NextStep } from "@jarso/core/learning";
import { type Href, useRouter } from "expo-router";
import { GraduationCapIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { useTokens } from "@/lib";

/** Where each next step leads on the phone (the web's `hrefFor`). */
export function nextStepHref(step: NextStep): Href {
  switch (step.kind) {
    case "resume":
    case "mission":
      return { pathname: "/(child)/learn/[missionKey]", params: { missionKey: step.missionKey } };
    case "check-in":
      return "/(child)/learn/check-in";
    case "comeback":
      return "/(child)/learn/week-question";
    case "practice":
      return "/(child)/learn/practice";
    case "done":
      return "/(child)/(tabs)/learn";
  }
}

/** One clear next step in learning (FR12), from core's `describeStep`; it opens that step. */
export function NextStepCard({ step }: { step: NextStep }) {
  const router = useRouter();
  const tokens = useTokens();
  const { title, body, cta } = describeStep(step);
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-2">
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <GraduationCapIcon size={16} color={tokens["muted-foreground"]} />
        </View>
        <Text className="font-sans-bold text-muted-foreground text-sm uppercase">
          {NEXT_STEP_EYEBROW}
        </Text>
      </View>
      <Text accessibilityRole="header" className="font-sans-bold text-h3">
        {title}
      </Text>
      <Text className="text-muted-foreground">{body}</Text>
      <Button
        size="lg"
        accessibilityLabel={cta}
        className="self-start"
        onPress={() => router.push(nextStepHref(step))}
      >
        <Text>{cta}</Text>
      </Button>
    </View>
  );
}
