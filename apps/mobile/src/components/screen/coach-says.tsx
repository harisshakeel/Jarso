import { type CoachMoment, coachIdFor, coachLine } from "@jarso/core/learning";
import type { JarsoMood } from "@jarso/core/mascot";
import { View } from "react-native";
import { Jarso } from "@/components/brand";
import { Text } from "@/components/ui";
import { useTokens } from "@/lib";

const SIZES = { sm: 44, md: 88 } as const;
// The bubble's surface, and the text colour on it. "secondary" is for a bubble placed on a card,
// where a card-coloured bubble would vanish.
const TEXT = { card: "text-foreground", secondary: "text-secondary-foreground" } as const;

/** Jarso and one line in a speech bubble; the line is chosen by a stable key. */
export function CoachSays({
  coachKey,
  moment,
  size = "sm",
  surface = "card",
}: {
  coachKey: string;
  moment: CoachMoment;
  size?: keyof typeof SIZES;
  surface?: keyof typeof TEXT;
}) {
  // The fill comes from the tokens, not a class, so the tail is always the bubble's colour.
  const fill = useTokens()[surface];
  const mood: JarsoMood = moment === "nothingNew" ? "sleepy" : "happy";
  return (
    <View className="flex-row items-end gap-2">
      <Jarso mood={mood} size={SIZES[size]} />
      <View
        testID="coach-says-bubble"
        className="relative flex-1 rounded-[20px] border-border border-b-[3px] p-4"
        style={{ backgroundColor: fill }}
      >
        <View
          testID="coach-says-tail"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            left: -9,
            top: 22,
            width: 0,
            height: 0,
            borderTopWidth: 9,
            borderBottomWidth: 9,
            borderRightWidth: 9,
            borderTopColor: "transparent",
            borderBottomColor: "transparent",
            borderRightColor: fill,
          }}
        />
        <Text className={`font-sans-extrabold ${TEXT[surface]}`}>
          {coachLine(coachIdFor(coachKey), moment)}
        </Text>
      </View>
    </View>
  );
}
