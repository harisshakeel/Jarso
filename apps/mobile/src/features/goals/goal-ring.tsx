import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Text } from "@/components/ui";
import { useTokens } from "@/lib";

const STROKE = 12;

/**
 * The goal's emoji in a gold progress ring. With a `label` it is a progressbar for screen
 * readers; without one it is decoration (the number is said elsewhere on the screen).
 */
export function GoalRing({
  emoji,
  value,
  size = 200,
  label,
}: {
  emoji: string;
  /** 0..1; more than 1 draws a full ring. */
  value: number;
  size?: number;
  label?: string;
}) {
  const tokens = useTokens();
  const filled = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const accessibility = label
    ? {
        accessible: true,
        accessibilityRole: "progressbar" as const,
        accessibilityLabel: label,
        accessibilityValue: { min: 0, max: 100, now: Math.round(filled * 100) },
      }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: "no-hide-descendants" as const,
      };
  return (
    <View
      testID="goal-ring"
      className="items-center justify-center"
      style={{ width: size, height: size }}
      {...accessibility}
    >
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tokens.muted}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tokens.gold}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * filled} ${circumference}`}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={{ fontSize: size * 0.42, lineHeight: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}
