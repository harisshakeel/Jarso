import { type CoachMoment, coachIdFor, coachLine, coachNames } from "@jarso/core/learning";
import { View } from "react-native";
import { Text } from "@/components/ui";

/** A coach and one line (the web's CoachSays, without the drawing): chosen by a stable key. */
export function CoachSays({ coachKey, moment }: { coachKey: string; moment: CoachMoment }) {
  const id = coachIdFor(coachKey);
  return (
    <View className="gap-1">
      <Text className="font-sans-semibold text-muted-foreground text-sm">{coachNames[id]}</Text>
      <View className="rounded-2xl rounded-bl-sm bg-secondary p-4">
        <Text className="font-sans-semibold text-secondary-foreground">
          {coachLine(id, moment)}
        </Text>
      </View>
    </View>
  );
}
