import {
  type Goal,
  type GoalProgress,
  goalCopy,
  goalLine,
  staircaseFor,
  staircaseLabel,
  stepsCaption,
} from "@jarso/core/goals";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Ellipse, G, Line, Text as SvgText } from "react-native-svg";
import { Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";

// The web's drawing box (goal-staircase.tsx): steps rise from the left, one coin taller each.
const W = 360;
const BASE = 236;
const COIN_RX = 15;
const COIN_RY = 6;
const COIN_STEP = 9;
const GROUND = 10;

type GoalStaircaseProps = {
  goal: Pick<Goal, "id" | "name" | "emoji" | "targetMinor" | "planMinor">;
  progress: GoalProgress;
  currency: string;
  /** Compact fits the Home card; full is the goal's screen. */
  size?: "compact" | "full";
};

function stepAt(index: number, steps: number) {
  const slot = (W - 40) / steps;
  const coins = index + 1;
  return { x: 20 + slot * index + slot / 2, top: BASE - GROUND - coins * COIN_STEP, coins };
}

/**
 * The goal as a staircase of coins (FR02), drawn from core's `staircaseFor` like the web: one
 * step per allowance, climbed steps solid gold, the rest ghosted, the goal's item on the top
 * step. One line under it says how far to go; the amounts open under "The amounts".
 */
export function GoalStaircase({ goal, progress, currency, size = "full" }: GoalStaircaseProps) {
  const tokens = useTokens();
  const [showAmounts, setShowAmounts] = useState(false);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const stair = staircaseFor(progress, goal.targetMinor, goal.planMinor);
  const top = stepAt(stair.steps - 1, stair.steps);
  const itemSize = size === "compact" ? 34 : 44;
  const viewTop = Math.floor(top.top - 14 - itemSize - 4);
  const height = BASE + 6 - viewTop;
  const caption = stepsCaption(stair);

  return (
    <View className="items-center gap-1">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={staircaseLabel(goal, stair, money)}
        className="w-full"
        style={{ aspectRatio: W / height, maxWidth: size === "compact" ? 320 : 480 }}
      >
        <Svg width="100%" height="100%" viewBox={`0 ${viewTop} ${W} ${height}`}>
          <Line
            x1={12}
            x2={W - 12}
            y1={BASE - GROUND + 1}
            y2={BASE - GROUND + 1}
            strokeWidth={2}
            strokeLinecap="round"
            stroke={tokens["hairline-strong"]}
          />
          {Array.from({ length: stair.steps }, (_, index) => {
            const step = stepAt(index, stair.steps);
            const climbed = index < stair.filled;
            return (
              <G key={step.x} opacity={climbed ? 1 : 0.35}>
                {Array.from({ length: step.coins }, (_, coin) => {
                  const y = BASE - GROUND - (coin + 1) * COIN_STEP + COIN_RY;
                  return (
                    <G key={y}>
                      <Ellipse
                        cx={step.x}
                        cy={y + 2.5}
                        rx={COIN_RX}
                        ry={COIN_RY}
                        fill={tokens["keycap-ledge"]}
                      />
                      <Ellipse
                        cx={step.x}
                        cy={y}
                        rx={COIN_RX}
                        ry={COIN_RY}
                        fill={climbed ? tokens.gold : tokens["tint-gold"]}
                      />
                    </G>
                  );
                })}
              </G>
            );
          })}
          <SvgText
            x={top.x}
            y={top.top - 14}
            textAnchor="middle"
            fontSize={itemSize}
            opacity={stair.reached ? 1 : 0.8}
          >
            {goal.emoji}
          </SvgText>
        </Svg>
      </View>
      <Text
        className={
          size === "full" ? "text-center font-sans-bold text-lg" : "text-center font-sans-bold"
        }
      >
        {goalLine(progress, money)}
      </Text>
      {caption ? (
        <Text className="text-center text-muted-foreground text-sm">{caption}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={goalCopy.staircase.amountsSummary}
        accessibilityState={{ expanded: showAmounts }}
        onPress={() => setShowAmounts((open) => !open)}
        className="min-h-11 justify-center rounded-full px-3"
      >
        <Text className="font-sans-bold text-muted-foreground text-sm">
          {goalCopy.staircase.amountsSummary}
        </Text>
      </Pressable>
      {showAmounts ? (
        <Text className="text-center text-muted-foreground text-sm">
          {goalCopy.staircase.amounts(
            money(progress.countedMinor),
            money(progress.remainingMinor),
            goal.planMinor ? money(goal.planMinor) : null,
          )}
        </Text>
      ) : null}
    </View>
  );
}
