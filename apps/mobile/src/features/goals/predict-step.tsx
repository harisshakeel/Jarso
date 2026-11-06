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
import { guessCopy, guessResult } from "@jarso/core/home";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Jarso } from "@/components/brand";
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
          <Text className="text-muted-foreground">{goalCopy.predict.tryAnother}</Text>
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
            <Text className="font-sans-extrabold text-money">{money(current)}</Text>
            <Button variant="outline" size="icon" onPress={() => nudge(step)}>
              <Text>+</Text>
            </Button>
          </View>
          {tried && tryMinor !== null ? (
            <View className="gap-2">
              <Text>
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

type JarsoGuessProps = {
  move: "put_in" | "take_out";
  amountMinor: number | null;
  goal: Pick<Goal, "name" | "emoji" | "targetMinor" | "planMinor">;
  saveMinor: number;
  reservedMinor: number;
};

/**
 * The kid flows' quick version of the guess: Jarso asks "closer or further?", then one calm line
 * with the real answer. Same `predictOutcome` as `PredictStep`; nothing here moves money.
 */
export function JarsoGuess({ move, amountMinor, goal, saveMinor, reservedMinor }: JarsoGuessProps) {
  // A guess is about one amount: change the amount and the question is asked again.
  const [answered, setAnswered] = useState<{
    amountMinor: number;
    guess: "further" | "closer";
  } | null>(null);
  if (amountMinor === null || amountMinor <= 0) return null;
  const outcome = predictOutcome({
    move,
    amountMinor,
    saveMinor,
    reservedMinor,
    targetMinor: goal.targetMinor,
    planMinor: goal.planMinor,
  });
  // Nothing moves the goal: nothing to ask.
  if (guessResult(outcome, "closer") === null) return null;
  const guess = answered?.amountMinor === amountMinor ? answered.guess : null;
  const result = guess ? guessResult(outcome, guess) : null;
  const question = guessCopy.question(goal.emoji);
  const options = [
    { key: "further", label: guessCopy.further },
    { key: "closer", label: guessCopy.closer },
  ] as const;

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <Jarso size={44} mood={result ? (result.right ? "cheer" : "happy") : "think"} />
        <View className="flex-1 rounded-xl bg-muted px-3 py-2">
          <Text accessibilityRole="header" className="font-sans-bold">
            {question}
          </Text>
        </View>
      </View>
      <View className="flex-row gap-2">
        {options.map((option) => (
          <Button
            key={option.key}
            variant="outline"
            className={cn("flex-1", guess === option.key && "border-primary bg-secondary")}
            accessibilityLabel={option.label}
            accessibilityState={{ selected: guess === option.key }}
            // Not `disabled`: that would dim the pill the child picked. One guess per amount.
            onPress={() => {
              if (guess === null) setAnswered({ amountMinor, guess: option.key });
            }}
          >
            <Text>{option.label}</Text>
          </Button>
        ))}
      </View>
      {result ? (
        <View
          accessibilityLiveRegion="polite"
          className="self-center rounded-full bg-secondary px-4 py-2"
        >
          <Text className="font-sans-bold text-secondary-foreground">
            {goal.emoji} {result.line}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
