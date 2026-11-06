import {
  onboardingCopy,
  type PracticeJars,
  practiceAmounts,
  practiceFill,
  practiceSave,
} from "@jarso/core/onboarding";
import * as Haptics from "expo-haptics";
import { CoinsIcon, HandCoinsIcon, MoveRightIcon } from "lucide-react-native";
import { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Button, Text } from "@/components/ui";
import { formatMoney, useTokens } from "@/lib";
import { playSound } from "@/lib/sound";
import { OnboardingFrame, Says } from "./onboarding-frame";

/** A drag further right than this drops the coin into Save. */
const DROP_DX = 60;

type SaveStepProps = {
  currency: string;
  start: PracticeJars;
  /** What the child calls their parent ("Mum", else "your parent"). */
  parent: string;
  onNext: () => void;
  onSkip: () => void;
};

/**
 * "This is Save": drag a practice coin from Spend into Save (or tap it), and Jarso fills. Says
 * once that for real the cash goes to the parent. Nothing is recorded.
 */
export function SaveStep({ currency, start, parent, onNext, onSkip }: SaveStepProps) {
  const tokens = useTokens();
  const { coinMinor } = practiceAmounts(currency);
  const [jars, setJars] = useState(start);
  const saved = jars.saveMinor > start.saveMinor;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const copy = onboardingCopy.save;

  const move = () => {
    setJars((current) => practiceSave(current, coinMinor));
    playSound("coin");
    Haptics.selectionAsync().catch(() => undefined);
  };
  const moveRef = useRef(move);
  moveRef.current = move;

  const drag = useRef(new Animated.ValueXY()).current;
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Small movements stay a tap on the coin; a real drag takes over from it.
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 8,
        onPanResponderMove: Animated.event([null, { dx: drag.x, dy: drag.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: (_e, g) => {
          if (g.dx > DROP_DX) moveRef.current();
          Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(drag, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    [drag],
  );

  return (
    <OnboardingFrame
      step="save"
      onSkip={onSkip}
      footer={
        saved ? (
          <Button variant="keycap" size="lg" onPress={onNext}>
            <Text>{onboardingCopy.next}</Text>
          </Button>
        ) : null
      }
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-extrabold text-h1">
          {copy.heading}
        </Text>
        <Text className="text-muted-foreground">{copy.sub(parent)}</Text>
      </View>
      <View className="flex-row items-center justify-between">
        <View className="items-center gap-1">
          <Jarso mood="happy" size={100} fill={0.45} tint="spend" />
          <Text className="font-sans-extrabold text-h3 text-teal-700">
            {copy.spendLabel(money(jars.spendMinor))}
          </Text>
        </View>
        <View className="items-center gap-1">
          <Animated.View
            {...responder.panHandlers}
            style={{ transform: drag.getTranslateTransform() }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.coin}
              disabled={jars.spendMinor === 0}
              onPress={move}
              className="size-12 items-center justify-center rounded-full border-b-4 border-gold-500 bg-gold"
            >
              <CoinsIcon size={24} color={tokens["gold-foreground"]} />
            </Pressable>
          </Animated.View>
          <MoveRightIcon size={32} color={tokens["gold-text"]} />
        </View>
        <View className="items-center gap-1">
          <Jarso mood={saved ? "wow" : "happy"} size={100} fill={practiceFill(jars)} />
          <Text className="font-sans-extrabold text-h3 text-gold-800">
            {copy.saveLabel(money(jars.saveMinor))}
          </Text>
        </View>
      </View>
      <View className="flex-row items-end gap-2">
        <Jarso mood={saved ? "cheer" : "think"} size={60} fill={0.3} />
        <Says>{saved ? copy.done : copy.ask}</Says>
      </View>
      <View className="flex-1" />
      <View className="flex-row items-center gap-3 rounded-3xl bg-gold-50 p-4">
        <View className="size-11 items-center justify-center rounded-2xl bg-gold-100">
          <HandCoinsIcon size={22} color={tokens["gold-text"]} />
        </View>
        <Text className="flex-1 font-sans-bold text-gold-900">{copy.realWorld(parent)}</Text>
      </View>
    </OnboardingFrame>
  );
}
