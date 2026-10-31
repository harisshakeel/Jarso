"use client";

import { type ComponentProps, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui";
import { GoalSheet, markCelebratedAction } from "@/features/goals";
import { TakeOutSheet } from "@/features/requests";
import { formatMoney } from "@/lib";
import type { HomeStep } from "../home-step";
import { NextStepCard } from "./next-step-card";

type HomeStepCardProps = {
  step: HomeStep;
  currency: string;
  /** How much the child can take out now, for "Ask to use my savings". */
  takeOutLimitMinor: number;
  /** Props for the goal sheet, for "Set a goal". */
  goalSheet: ComponentProps<typeof GoalSheet>;
};

/** "Do this next" on child Home: one thing, in plain words, with at most one button. */
export function HomeStepCard({ step, currency, takeOutLimitMinor, goalSheet }: HomeStepCardProps) {
  if (step.kind === "learning") return <NextStepCard step={step.step} />;
  return (
    <Card className="shadow-raised">
      <CardContent>
        <section aria-labelledby="home-step-heading" className="grid gap-3">
          <p className="eyebrow">
            {step.kind === "goal-reached" ? "Goal reached" : "Do this next"}
          </p>
          <StepBody
            step={step}
            currency={currency}
            takeOutLimitMinor={takeOutLimitMinor}
            goalSheet={goalSheet}
          />
        </section>
      </CardContent>
    </Card>
  );
}

function StepBody({ step, currency, takeOutLimitMinor, goalSheet }: HomeStepCardProps) {
  switch (step.kind) {
    case "goal-reached":
      return (
        <GoalReached
          goalId={step.goalId}
          title={`Saved up. ${step.emoji} ${step.name}.`}
          currency={currency}
          takeOutLimitMinor={takeOutLimitMinor}
        />
      );
    case "withdrawal-approved":
      return (
        <>
          <h2 id="home-step-heading" className="text-h3">
            Your parent said yes
          </h2>
          <p className="text-ink-2">
            {formatMoney(step.amountMinor, currency, { showMinor: "nonzero" })} from Save, coming
            soon.
          </p>
        </>
      );
    case "set-goal":
      return (
        <>
          <h2 id="home-step-heading" className="text-h3">
            Something to save for?
          </h2>
          <p className="text-ink-2">Pick something you want and how much it costs.</p>
          <div className="flex">
            <GoalSheet {...goalSheet} goal={null} />
          </div>
        </>
      );
    case "all-done":
      return (
        <>
          <h2 id="home-step-heading" className="text-h3">
            All done for today.
          </h2>
          <p className="text-ink-2">Your jars are up to date. Come back any time.</p>
        </>
      );
    default:
      return null;
  }
}

/** Shown once: marks the moment as celebrated on mount. No confetti (design.md §8). */
function GoalReached({
  goalId,
  title,
  currency,
  takeOutLimitMinor,
}: {
  goalId: string;
  title: string;
  currency: string;
  takeOutLimitMinor: number;
}) {
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markCelebratedAction(null, { goalId });
  }, [goalId]);
  return (
    <>
      <h2 id="home-step-heading" className="text-h3">
        {title}
      </h2>
      <p className="text-ink-2">You did it by saving a bit each time.</p>
      <div className="flex">
        <TakeOutSheet
          currency={currency}
          limitMinor={takeOutLimitMinor}
          trigger={{ label: "Ask to use my savings", variant: "keycap-gold" }}
        />
      </div>
    </>
  );
}
