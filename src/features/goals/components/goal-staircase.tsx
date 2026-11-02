"use client";

import { useEffect, useRef, useState } from "react";
import { CoachFigure, type CoachReaction, coachIdFor } from "@/components/brand";
import { cn, formatMoney } from "@/lib";
import {
  goalLine,
  milestoneCrossed,
  staircaseFor,
  staircaseLabel,
  stepsCaption,
} from "../staircase";
import type { Goal, GoalProgress } from "../types";

// The drawing box. Steps rise from the left; every step is one coin taller than the last.
const W = 360;
const BASE = 236;
const COIN_RX = 15;
const COIN_RY = 6;
/** Height one coin adds to a stack. */
const COIN_STEP = 9;
const GROUND = 10;
/** How long the glow and the cheer last after a quarter mark is passed. */
const CHEER_MS = 900;

type GoalStaircaseProps = {
  goal: Pick<Goal, "id" | "name" | "emoji" | "targetMinor" | "planMinor">;
  progress: GoalProgress;
  currency: string;
  /** Compact fits the Home card (about 180 px tall); full is the goal's page. */
  size?: "compact" | "full";
  className?: string;
};

/** The step's x centre and the y of its top coin. */
function stepAt(index: number, steps: number): { x: number; top: number; coins: number } {
  const slot = (W - 40) / steps;
  const coins = index + 1;
  return {
    x: 20 + slot * index + slot / 2,
    top: BASE - GROUND - coins * COIN_STEP,
    coins,
  };
}

/** A coin as the mark draws it: gold on a teal rim; ghosted when the step is still to climb. */
function Coin({ x, y, ghost }: { x: number; y: number; ghost: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} className={ghost ? "opacity-35" : undefined}>
      <ellipse cy={2.5} rx={COIN_RX} ry={COIN_RY} className="fill-teal-800" />
      <ellipse rx={COIN_RX} ry={COIN_RY} className={ghost ? "fill-gold-100" : "fill-gold"} />
    </g>
  );
}

/**
 * The goal as a staircase of coins (FR02): one step per allowance, climbed steps solid gold,
 * the rest ghosted, the goal's item on the top step and the child's coach on the step they
 * have reached. Passing a quarter mark lights that step and the coach cheers once; reduced
 * motion shows the lit step still. One line under it says how far to go; the amounts sit in a
 * disclosure. Every figure is also in the words.
 */
export function GoalStaircase({
  goal,
  progress,
  currency,
  size = "full",
  className,
}: GoalStaircaseProps) {
  const money = (minor: number) => formatMoney(minor, currency, { showMinor: "nonzero" });
  const stair = staircaseFor(progress, goal.targetMinor, goal.planMinor);
  const coach = coachIdFor(`goal:${goal.id}`);
  // A quarter mark passed since the last paint lights the step and makes the coach cheer, once
  // (design.md §8): the first paint and money leaving do nothing.
  const seen = useRef(progress.fillRatio);
  const [lit, setLit] = useState<number | null>(null);
  useEffect(() => {
    const crossed = milestoneCrossed(seen.current, progress.fillRatio);
    seen.current = progress.fillRatio;
    if (crossed === null) return;
    setLit(stair.filled);
    const over = setTimeout(() => setLit(null), CHEER_MS);
    return () => clearTimeout(over);
  }, [progress.fillRatio, stair.filled]);
  const reaction: CoachReaction = lit !== null ? "cheer" : null;

  const top = stepAt(stair.steps - 1, stair.steps);
  const coachHeight = size === "compact" ? 64 : 84;
  const coachWidth = Math.round(coachHeight * (168 / 292));
  // On the ground before the first step, or on top of the last climbed step.
  const stand =
    stair.coachAt === 0
      ? { x: 20 + (W - 40) / stair.steps / 2 - coachWidth * 0.55, y: BASE - GROUND }
      : (() => {
          const step = stepAt(stair.coachAt - 1, stair.steps);
          return { x: step.x, y: step.top - COIN_RY };
        })();
  const caption = stepsCaption(stair);
  const steps = Array.from({ length: stair.steps }, (_, index) => {
    const step = stepAt(index, stair.steps);
    return {
      ...step,
      index,
      coinYs: Array.from(
        { length: step.coins },
        (_, coin) => BASE - GROUND - (coin + 1) * COIN_STEP + COIN_RY,
      ),
    };
  });

  return (
    <figure className={cn("grid gap-2", className)}>
      <svg
        role="img"
        aria-label={staircaseLabel(goal, stair, money)}
        viewBox={`0 0 ${W} ${BASE + 6}`}
        className={cn(
          "mx-auto h-auto w-full select-none overflow-visible",
          size === "compact" ? "max-w-sm" : "max-w-xl",
        )}
      >
        <line
          x1={12}
          x2={W - 12}
          y1={BASE - GROUND + 1}
          y2={BASE - GROUND + 1}
          strokeWidth={2}
          strokeLinecap="round"
          className="stroke-hairline-strong"
        />
        {steps.map((step) => {
          const climbed = step.index < stair.filled;
          return (
            <g key={step.x} data-step={step.index} data-climbed={climbed ? "true" : "false"}>
              {lit === step.index + 1 ? (
                <ellipse
                  data-lit
                  cx={step.x}
                  cy={step.top + (step.coins * COIN_STEP) / 2}
                  rx={COIN_RX * 2}
                  ry={step.coins * COIN_STEP * 0.7 + 10}
                  className="fill-gold opacity-25 motion-safe:animate-[badge-in_400ms_var(--ease-brand)_both]"
                />
              ) : null}
              {step.coinYs.map((y) => (
                <Coin key={y} x={step.x} y={y} ghost={!climbed} />
              ))}
            </g>
          );
        })}
        <text
          data-goal-item
          x={top.x}
          y={top.top - 14}
          textAnchor="middle"
          fontSize={size === "compact" ? 34 : 44}
          className={cn(!stair.reached && "opacity-80")}
        >
          {goal.emoji}
        </text>
        <svg
          aria-hidden
          data-coach-at={stair.coachAt}
          x={stand.x - (stair.coachAt === 0 ? 0 : coachWidth / 2)}
          y={stand.y - coachHeight}
          width={coachWidth}
          height={coachHeight}
          overflow="visible"
        >
          <CoachFigure coach={coach} size={coachHeight} reaction={reaction} />
        </svg>
      </svg>
      <figcaption className="grid justify-items-center gap-1 text-center">
        <p className={cn("font-semibold", size === "full" && "text-lg")}>
          {goalLine(progress, money)}
        </p>
        {caption ? <p className="text-ink-2 text-sm">{caption}</p> : null}
        <details className="text-ink-2 text-sm">
          <summary className="cursor-pointer rounded-full px-2 py-1 font-semibold hover:bg-muted">
            The amounts
          </summary>
          <p className="pt-1">
            {money(progress.countedMinor)} saved · {money(progress.remainingMinor)} to go
            {goal.planMinor ? ` · ${money(goal.planMinor)} each allowance` : ""}
          </p>
        </details>
      </figcaption>
    </figure>
  );
}
