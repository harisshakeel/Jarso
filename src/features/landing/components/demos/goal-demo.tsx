"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { DemoCard, LiveStage, pounds } from "./demo-parts";

const GOAL = 40;
const BEFORE = 18;
const WEEK = 4;

/** Step 03, playable: add this week's £4 and watch the goal move. */
export function GoalDemo({ onDone }: { onDone: () => void }) {
  const [done, setDone] = useState(false);
  const saved = done ? BEFORE + WEEK : BEFORE;

  return (
    <LiveStage
      label="A savings goal"
      hint={
        done
          ? "Closer. About five more allowances to go."
          : "Tap to add this week's £4 to the goal."
      }
      done={done}
    >
      <DemoCard className="grid justify-items-center gap-4 py-6 text-center sm:py-8">
        <div className="grid gap-1">
          <p className="eyebrow">Goal</p>
          <p className="font-extrabold text-h2">Football boots</p>
        </div>
        <div className="relative size-44">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
            <circle
              cx={60}
              cy={60}
              r={50}
              fill="none"
              strokeWidth={12}
              className="stroke-teal-100 dark:stroke-teal-900"
            />
            <circle
              cx={60}
              cy={60}
              r={50}
              fill="none"
              strokeWidth={12}
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${(saved / GOAL) * 100} 100`}
              className="stroke-gold transition-[stroke-dasharray] duration-700 ease-[var(--ease-brand)]"
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center">
            <p className="money font-extrabold text-money-l">{pounds(saved)}</p>
            <p className="text-ink-2">of {pounds(GOAL)}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="keycap-gold"
          size="lg"
          disabled={done}
          onClick={() => {
            setDone(true);
            onDone();
          }}
        >
          {done ? `+${pounds(WEEK)} saved` : `Add this week's ${pounds(WEEK)}`}
        </Button>
      </DemoCard>
    </LiveStage>
  );
}
