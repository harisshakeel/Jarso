import { goalCopy } from "@jarso/core/goals";
import { StarIcon, TrophyIcon } from "lucide-react-native";
import { View } from "react-native";
import Animated, { useReducedMotion, ZoomIn } from "react-native-reanimated";
import { Text } from "@/components/ui";
import { useTokens } from "@/lib";

const STEP_MS = 120;

/** Three stars (25, 50, 75%) and the trophy (reached), lit gold up to `lit` of 4. */
export function MilestoneStars({ lit }: { lit: number }) {
  const tokens = useTokens();
  const reduced = useReducedMotion();
  return (
    <View
      accessible
      accessibilityLabel={goalCopy.page.starsLabel(lit)}
      className="flex-row justify-between px-2"
    >
      {goalCopy.page.stars.map((caption, i) => {
        const on = i < lit;
        const Icon = i === 3 ? TrophyIcon : StarIcon;
        return (
          <View key={caption} className="items-center gap-1">
            <Animated.View
              testID={i === 3 ? "trophy" : `star-${i + 1}`}
              entering={reduced ? undefined : ZoomIn.delay(i * STEP_MS)}
              className="size-12 items-center justify-center rounded-full"
              style={{ backgroundColor: on ? tokens.gold : tokens.muted }}
            >
              <Icon
                size={24}
                color={on ? tokens["gold-foreground"] : tokens["muted-foreground"]}
                fill={on ? tokens["gold-foreground"] : "none"}
              />
            </Animated.View>
            <Text className="text-muted-foreground text-small">{caption}</Text>
          </View>
        );
      })}
    </View>
  );
}
