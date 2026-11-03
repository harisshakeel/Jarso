"use client";

import type { Goal } from "@jarso/core/goals";
import {
  explainOutcome,
  goalCopy,
  type Move,
  PREDICT_LABEL,
  PREDICT_QUESTION,
  PREDICTIONS,
  type Prediction,
  predictOutcome,
} from "@jarso/core/goals";
import { useId, useState } from "react";
import { Button, Slider } from "@/components/ui";
import { formatMoney } from "@/lib";

type PredictStepProps = {
  move: Move;
  /** The amount the child typed, in minor units; null until it parses. */
  amountMinor: number | null;
  goal: Pick<Goal, "name" | "emoji" | "targetMinor" | "planMinor">;
  saveMinor: number;
  reservedMinor: number;
  currency: string;
  /** The most the what-if slider offers (free Save for a take-out, free Spend for a put-in). */
  maxMinor: number;
  /** Called with the slider's amount when the child wants to use that one instead. */
  onTryAmount?: (amountMinor: number) => void;
};

/**
 * Predict before deciding (FR05). Before a move that touches savings, the child guesses what it
 * does to their goal; the real answer is revealed with a plain explanation, and a slider lets them
 * try other amounts without moving any money. Pure arithmetic from `predictOutcome`.
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
  const groupId = useId();
  if (amountMinor === null || amountMinor <= 0) return null;
  const guess = answered?.amountMinor === amountMinor ? answered.guess : null;
  const setGuess = (next: Prediction) => setAnswered({ amountMinor, guess: next });
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
  // Step by a round unit of the currency, at least 1 minor unit.
  const step = Math.max(1, 10 ** Math.max(0, String(maxMinor).length - 3));

  return (
    <section
      aria-labelledby={`${groupId}-q`}
      className="grid gap-3 rounded-xl border border-hairline bg-secondary p-4"
    >
      <p id={`${groupId}-q`} className="font-semibold">
        {goal.emoji} {PREDICT_QUESTION[move]}
      </p>
      <fieldset aria-labelledby={`${groupId}-q`} className="flex flex-wrap gap-2">
        {PREDICTIONS.map((option) => (
          <Button
            key={option}
            type="button"
            variant="outline"
            size="lg"
            aria-pressed={guess === option}
            disabled={guess !== null}
            className={guess !== null && option === outcome.actual ? "border-primary" : undefined}
            onClick={() => setGuess(option)}
          >
            {PREDICT_LABEL[option]}
          </Button>
        ))}
      </fieldset>
      {guess !== null ? (
        <div role="status" className="grid gap-3">
          <p>
            <span className="font-semibold">
              {guess === outcome.actual ? goalCopy.predict.right : goalCopy.predict.wrong}
            </span>
            {explainOutcome(outcome, goal.name, money)}
          </p>
          <div className="grid gap-2">
            <span id={`${groupId}-try`} className="text-ink-2 text-sm">
              {goalCopy.predict.tryAnother}
            </span>
            <Slider
              aria-labelledby={`${groupId}-try`}
              min={0}
              max={Math.max(maxMinor, amountMinor)}
              step={step}
              value={[tryMinor ?? amountMinor]}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                if (typeof next === "number") setTryMinor(next);
              }}
            />
            {tried && tryMinor !== null ? (
              <p className="text-sm">
                <span className="money font-bold">{money(tryMinor)}</span>:{" "}
                {explainOutcome(tried, goal.name, money)}
                {onTryAmount && tryMinor > 0 && tryMinor !== amountMinor ? (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="font-semibold text-primary underline underline-offset-4"
                      onClick={() => onTryAmount(tryMinor)}
                    >
                      {goalCopy.predict.useAmount}
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
