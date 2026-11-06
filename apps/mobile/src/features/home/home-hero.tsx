import type { JarsoLook, JarsoMood } from "@jarso/core/mascot";
import { View } from "react-native";
import { Jarso } from "@/components/brand";
import { Text } from "@/components/ui";

/** Jarso with one bubble: how the jars moved this week. Jarso's mood follows what happened. */
export function HomeHero({
  text,
  mood,
  fill,
  look,
}: {
  text: string;
  mood: JarsoMood;
  fill: number;
  look: JarsoLook | undefined;
}) {
  return (
    <View className="items-center gap-2 py-1">
      <Jarso size={120} mood={mood} fill={fill} look={look} bounce />
      <View className="rounded-2xl bg-tint-teal px-4 py-2.5">
        <Text className="text-center font-sans-bold">{text}</Text>
      </View>
    </View>
  );
}
