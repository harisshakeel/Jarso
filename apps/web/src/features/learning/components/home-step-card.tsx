"use client";

import { goalCopy } from "@jarso/core/goals";
import type { HomeStep } from "@jarso/core/learning";
import { CircleCheckIcon } from "lucide-react";
import { type ComponentProps, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui";
import { GoalSheet, markCelebratedAction } from "@/features/goals";
import { TakeOutSheet } from "@/features/requests";
import { formatMoney, logger } from "@/lib";
import { NextStepCard } from "./next-step-card";

type HomeStepCardProps = {
  step: HomeStep;
  currency: string;
  /** How much the child can take out now, for "Ask to use my savings". */
  takeOutLimitMinor: number;
  /** Props for the goal sheet, for "Set a goal". */
  goalSheet: ComponentProps<typeof GoalSheet>;
  /** Without its card: Home's learning card holds it beside the run and the road. */
  bare?: boolean;
};

/** "Do this next" on child Home: one thing, in plain words, with at most one button. */
export function HomeStepCard({
  step,
  currency,
  takeOutLimitMinor,
  goalSheet,
  bare = false,
}: HomeStepCardProps) {
  if (step.kind === "learning") return <NextStepCard step={step.step} bare={bare} />;
  const section = (
    <section aria-labelledby="home-step-heading" className="grid content-center gap-3">
      <p className="eyebrow">
        {step.kind === "goal-reached" ? goalCopy.home.goalReachedEyebrow : goalCopy.home.doThisNext}
      </p>
      <StepBody
        step={step}
        currency={currency}
        takeOutLimitMinor={takeOutLimitMinor}
        goalSheet={goalSheet}
      />
    </section>
  );
  if (bare) return section;
  return (
    <Card className="shadow-raised">
      <CardContent>{section}</CardContent>
    </Card>
  );
}

function StepBody({ step, currency, takeOutLimitMinor, goalSheet }: HomeStepCardProps) {
  switch (step.kind) {
    case "goal-reached":
      return (
        <GoalReached
          goalId={step.goalId}
          title={goalCopy.home.reachedTitle(step.emoji, step.name)}
          currency={currency}
          takeOutLimitMinor={takeOutLimitMinor}
        />
      );
    case "withdrawal-approved":
      return (
        <>
          <h2 id="home-step-heading" className="text-h3">
            {goalCopy.home.approvedTitle}
          </h2>
          <p className="text-ink-2">
            {goalCopy.home.approvedBody(
              formatMoney(step.amountMinor, currency, { showMinor: "nonzero" }),
            )}
          </p>
        </>
      );
    case "set-goal":
      return (
        <>
          <h2 id="home-step-heading" className="text-h3">
            {goalCopy.home.setGoalTitle}
          </h2>
          <div className="flex">
            <GoalSheet {...goalSheet} goal={null} />
          </div>
        </>
      );
    case "all-done":
      return (
        <>
          <h2 id="home-step-heading" className="text-h3">
            {goalCopy.home.allDoneTitle}
          </h2>
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
    // Best effort: if it fails (offline), the moment simply shows again next visit.
    markCelebratedAction(null, { goalId }).catch((error: unknown) => {
      logger.warn("Could not save the goal moment", {
        error: error instanceof Error ? error.name : "unknown",
      });
    });
  }, [goalId]);
  return (
    <>
      <GoalBadge />
      <h2 id="home-step-heading" className="text-h3">
        {title}
      </h2>
      <div className="flex">
        <TakeOutSheet
          currency={currency}
          limitMinor={takeOutLimitMinor}
          trigger={{ label: goalCopy.home.askToUse, variant: "keycap-gold" }}
        />
      </div>
    </>
  );
}

/** Goal reached (design.md §8): the gold ring closes and the badge scales in, once. */
function GoalBadge() {
  return (
    <div aria-hidden className="relative grid size-20 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="44" fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          className="stroke-gold motion-safe:animate-[ring-close_600ms_var(--ease-brand)_both]"
        />
      </svg>
      <CircleCheckIcon className="size-10 text-primary motion-safe:animate-[badge-in_600ms_var(--ease-brand)_both]" />
    </div>
  );
}
