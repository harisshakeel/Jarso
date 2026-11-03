import {
  explainOutcome,
  type Goal,
  goalCopy,
  type Move,
  PREDICT_LABEL,
  PREDICT_QUESTION,
  PREDICTIONS,
  type Prediction,
  predictOutcome,
} from "@jarso/core/goals";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Text } from "@/components/ui";
import { cn, formatMoney } from "@/lib";

type PredictStepProps = {
  move: Move;
  /** The amount the child typed, in minor units; null until it parses. */
  amountMinor: number | null;
  goal: Pick<Goal, "name" | "emoji" | "targetMinor" | "planMinor">;
  saveMinor: number;
  reservedMinor: number;
  currency: string;
  /** The most the what-if stepper offers (free Save for a take-out, free Spend for a put-in). */
  maxMinor: number;
  /** Called with the tried amount when the child wants to use that one instead. */
  onTryAmount?: (amountMinor: number) => void;
};

/**
 * Predict before deciding (FR05), as on the web: the child guesses what the move does to their
 * goal, then the real answer shows with a plain explanation, and a stepper lets them try other
 * amounts without moving any money. Pure arithmetic from core's `predictOutcome`.
 */
export function PredictStep({
  move,
  amountMinor,
  goal,
  saveMinor,
  reservedMinor,
  currency,
  maxMinor,
  onTryAmount,
}: PredictStepProps) {
  // A guess is about one amount: change the amount and the question is asked again.
  const [answered, setAnswered] = useState<{ amountMinor: number; guess: Prediction } | null>(null);
  const [tryMinor, setTryMinor] = useState<number | null>(null);
  if (amountMinor === null || amountMinor <= 0) return null;
  const guess = answered?.amountMinor === amountMinor ? answered.guess : null;
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const input = {
    move,
    saveMinor,
    reservedMinor,
    targetMinor: goal.targetMinor,
    planMinor: goal.planMinor,
  };
  const outcome = predictOutcome({ ...input, amountMinor });
  const tried = tryMinor === null ? null : predictOutcome({ ...input, amountMinor: tryMinor });
  // Step by a round unit of the currency, at least 1 minor unit (the web slider's step).
  const step = Math.max(1, 10 ** Math.max(0, String(maxMinor).length - 3));
  const max = Math.max(maxMinor, amountMinor);
  const current = tryMinor ?? amountMinor;
  const nudge = (by: number) => setTryMinor(Math.min(max, Math.max(0, current + by)));
  const question = `${goal.emoji} ${PREDICT_QUESTION[move]}`;

  return (
    <View className="gap-3 rounded-xl border border-border bg-secondary p-4">
      <Text className="font-sans-bold text-secondary-foreground">{question}</Text>
      <View accessibilityLabel={question} className="flex-row flex-wrap gap-2">
        {PREDICTIONS.map((option) => (
          <Button
            key={option}
            variant="outline"
            accessibilityLabel={PREDICT_LABEL[option]}
            accessibilityState={{ selected: guess === option, disabled: guess !== null }}
            disabled={guess !== null}
            className={cn(guess !== null && option === outcome.actual && "border-primary")}
            onPress={() => setAnswered({ amountMinor, guess: option })}
          >
            <Text>{PREDICT_LABEL[option]}</Text>
          </Button>
        ))}
      </View>
      {guess !== null ? (
        <View accessibilityLiveRegion="polite" className="gap-3">
          <Text>
            <Text className="font-sans-bold">
              {guess === outcome.actual ? goalCopy.predict.right : goalCopy.predict.wrong}
            </Text>
            {explainOutcome(outcome, goal.name, money)}
          </Text>
          <Text className="text-muted-foreground text-sm">{goalCopy.predict.tryAnother}</Text>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={goalCopy.predict.tryAnother}
            accessibilityValue={{ text: money(current) }}
            accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
            onAccessibilityAction={(event) =>
              nudge(event.nativeEvent.actionName === "increment" ? step : -step)
            }
            className="flex-row items-center justify-between gap-3"
          >
            <Button variant="outline" size="icon" onPress={() => nudge(-step)}>
              <Text>−</Text>
            </Button>
            <Text className="font-sans-extrabold text-lg">{money(current)}</Text>
            <Button variant="outline" size="icon" onPress={() => nudge(step)}>
              <Text>+</Text>
            </Button>
          </View>
          {tried && tryMinor !== null ? (
            <View className="gap-2">
              <Text className="text-sm">
                <Text className="font-sans-bold">{money(tryMinor)}</Text>
                {`: ${explainOutcome(tried, goal.name, money)}`}
              </Text>
              {onTryAmount && tryMinor > 0 && tryMinor !== amountMinor ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={goalCopy.predict.useAmount}
                  onPress={() => onTryAmount(tryMinor)}
                  className="min-h-11 justify-center"
                >
                  <Text className="font-sans-bold text-primary underline">
                    {goalCopy.predict.useAmount}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
