import {
  onboardingCopy,
  type PracticeJars,
  practiceAmounts,
  practiceBuy,
  startPractice,
} from "@jarso/core/onboarding";
import * as Haptics from "expo-haptics";
import { CookieIcon, PointerIcon, WalletIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Jarso } from "@/components/brand";
import { Button, Text } from "@/components/ui";
import { cn, formatMoney, useTokens } from "@/lib";
import { playSound } from "@/lib/sound";
import { OnboardingFrame, Says } from "./onboarding-frame";
import { useTicker } from "./use-ticker";

type SpendStepProps = {
  currency: string;
  onNext: (jars: PracticeJars) => void;
  onSkip: () => void;
};

/** "This is Spend": tap the snack and the practice 100 ticks down to 80. Nothing is recorded. */
export function SpendStep({ currency, onNext, onSkip }: SpendStepProps) {
  const tokens = useTokens();
  const { startMinor, snackMinor } = practiceAmounts(currency);
  const [jars, setJars] = useState(() => startPractice(currency));
  const bought = jars.spendMinor < startMinor;
  const shown = useTicker(jars.spendMinor);
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const copy = onboardingCopy.spend;

  const buy = () => {
    if (bought) return;
    setJars((current) => practiceBuy(current, snackMinor));
    playSound("coin");
    Haptics.selectionAsync().catch(() => undefined);
  };

  return (
    <OnboardingFrame
      step="spend"
      onSkip={onSkip}
      footer={
        bought ? (
          <Button variant="keycap" size="lg" onPress={() => onNext(jars)}>
            <Text>{onboardingCopy.next}</Text>
          </Button>
        ) : (
          <View className="h-14 flex-row items-center justify-center gap-2">
            <PointerIcon size={18} color={tokens["muted-foreground"]} />
            <Text className="font-sans-bold text-muted-foreground">{copy.hint}</Text>
          </View>
        )
      }
    >
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-extrabold text-h1">
          {copy.heading}
        </Text>
        <Text className="text-muted-foreground">{copy.sub}</Text>
      </View>
      <View className="gap-2 rounded-3xl bg-teal-700 p-5">
        <View className="flex-row items-center gap-1.5">
          <WalletIcon size={18} color="#ffffff" />
          <Text className="font-sans-bold text-white">Spend</Text>
        </View>
        <Text testID="practice-spend" className="font-sans-extrabold text-money-xl text-white">
          {money(shown)}
        </Text>
        <Text className="text-small text-white">{copy.caption}</Text>
      </View>
      <View className="flex-row items-end gap-2">
        <Jarso mood={bought ? "cheer" : "happy"} size={64} fill={0.3} />
        <Says>{bought ? copy.done : copy.ask(money(snackMinor))}</Says>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.snack(money(snackMinor))}
        accessibilityState={{ disabled: bought }}
        disabled={bought}
        onPress={buy}
        className={cn(
          "w-36 items-center gap-2 self-center rounded-3xl border-4 bg-card p-3",
          bought ? "border-border opacity-60" : "border-gold",
        )}
      >
        <View className="size-12 items-center justify-center rounded-2xl bg-tint-cyan">
          <CookieIcon size={26} color={tokens.primary} />
        </View>
        <Text className="font-sans-bold">{copy.snack(money(snackMinor))}</Text>
      </Pressable>
    </OnboardingFrame>
  );
}
