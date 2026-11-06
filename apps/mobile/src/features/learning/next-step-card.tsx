import { describeStep, type NextStep } from "@jarso/core/learning";
import { type Href, useRouter } from "expo-router";
import { GraduationCapIcon } from "lucide-react-native";
import { View } from "react-native";
import { Button, Text } from "@/components/ui";
import { ON_GRAPE } from "./on-grape";

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
  const { title, body, cta } = describeStep(step);
  return (
    <View className="gap-3 rounded-[24px] bg-tint-grape p-4">
      <View className="flex-row items-center gap-3">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="size-11 items-center justify-center rounded-2xl bg-grape-500"
        >
          <GraduationCapIcon size={22} color={ON_GRAPE} />
        </View>
        <Text accessibilityRole="header" className="flex-1 font-sans-bold text-h3">
          {title}
        </Text>
      </View>
      <Text className="text-muted-foreground">{body}</Text>
      <Button
        variant="keycap-grape"
        accessibilityLabel={cta}
        className="self-start"
        onPress={() => router.push(nextStepHref(step))}
      >
        <Text>{cta}</Text>
      </Button>
    </View>
  );
}
