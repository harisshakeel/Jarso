import { palette } from "@jarso/brand/tokens";
import { playerCopy, renderText } from "@jarso/core/learning";
import type { JarsoLook } from "@jarso/core/mascot";
import { LightbulbIcon } from "lucide-react-native";
import { View } from "react-native";
import { Jarso } from "@/components/brand";
import { Text } from "@/components/ui";

type JarsoHintProps = {
  /** coach.says.idle / .hint / .checkIn; null once there is nothing left to say but the hints. */
  line: string | null;
  /** Already sliced to the hints asked for. */
  hints: string[];
  currency: string;
  look?: JarsoLook;
};

/** Jarso thinking beside a speech bubble: one line, then the hints the child asked for. */
export function JarsoHint({ line, hints, currency, look }: JarsoHintProps) {
  if (line === null && hints.length === 0) return null;
  return (
    <View className="flex-row items-end gap-2">
      <Jarso mood="think" size={64} look={look} />
      <View className="flex-1 gap-2 rounded-2xl rounded-bl-sm bg-secondary p-3">
        {line !== null ? (
          <Text className="font-sans-semibold text-secondary-foreground">{line}</Text>
        ) : null}
        {hints.length > 0 ? (
          <View accessibilityLabel={playerCopy.hints} className="gap-2">
            {hints.map((hint) => (
              <View key={hint} className="flex-row gap-2 rounded-xl bg-gold-100 p-3">
                <LightbulbIcon size={18} color={palette.gold[700]} />
                <Text className="flex-1 font-sans-semibold text-gold-700">
                  {renderText(hint, currency)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
