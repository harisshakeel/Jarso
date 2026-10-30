"use client";

import { useTimeline } from "../../hooks/use-timeline";
import { easeInOut, easeOut, easeOutBack, lerp, segment } from "../../motion";
import { DemoCard, DemoStage, FloatingChip, pounds } from "./demo-parts";

const GOAL = 40;

/** Step 03: this week's £4 moves the boots goal from £18 to £22; about five allowances to go. */
export function GoalDemo({ play }: { play: boolean }) {
  const t = useTimeline(play, 2400);
  const chip = easeOutBack(segment(t, 250, 550));
  const saved = lerp(18, 22, easeInOut(segment(t, 600, 1600)));
  const left = easeOut(segment(t, 1700, 2000));

  return (
    <DemoStage label="A savings goal: football boots for £40. This week's £4 moves it from £18 to £22, about five allowances to go.">
      <div className="relative">
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
                className="stroke-gold"
              />
            </svg>
            <div className="absolute inset-0 grid place-content-center">
              <p className="money font-extrabold text-money-l">{pounds(saved)}</p>
              <p className="text-ink-2 text-sm">of {pounds(GOAL)}</p>
            </div>
          </div>
          <p
            className="font-semibold text-ink-2"
            style={{ opacity: left, translate: `0 ${(1 - left) * 8}px` }}
          >
            About 5 more allowances
          </p>
        </DemoCard>
        <FloatingChip shown={chip} className="-top-4 right-4 text-gold-800 dark:text-gold">
          +{pounds(4)} saved this week
        </FloatingChip>
      </div>
    </DemoStage>
  );
}
