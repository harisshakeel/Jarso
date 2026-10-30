"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib";
import { landingCopy } from "../copy";
import { useInView } from "../hooks/use-in-view";
import { GoalDemo } from "./demos/goal-demo";
import { HandoverDemo } from "./demos/handover-demo";
import { MissionDemo } from "./demos/mission-demo";
import { PurchaseDemo } from "./demos/purchase-demo";
import { TwoBeat } from "./two-beat";

const demos = [HandoverDemo, PurchaseDemo, GoalDemo, MissionDemo] as const;
const numeral = (index: number) => String(index + 1).padStart(2, "0");

function Step({ index, onActive }: { index: number; onActive: (index: number) => void }) {
  const step = useRef<HTMLLIElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const centred = useInView(step, { threshold: 0, rootMargin: "-45% 0px -45% 0px" });
  const play = useInView(stage, { threshold: 0.5 });
  const copy = landingCopy.how.steps[index];
  const Demo = demos[index];

  useEffect(() => {
    if (centred) onActive(index);
  }, [centred, index, onActive]);

  if (!copy || !Demo) return null;
  return (
    <li
      ref={step}
      className="relative grid gap-8 py-14 pl-8 sm:pl-10 lg:min-h-[80svh] lg:grid-cols-[5fr_6fr] lg:items-center lg:gap-16 lg:py-16 lg:pl-0"
    >
      <span
        aria-hidden
        className="absolute top-[4.25rem] -left-px size-4 -translate-x-1/2 rounded-full bg-primary ring-4 ring-background lg:hidden"
      />
      <div className="grid content-start gap-3">
        <p
          aria-hidden
          className="font-extrabold text-6xl text-transparent leading-none [-webkit-text-stroke:1.5px_var(--color-muted-foreground)] lg:hidden"
        >
          {numeral(index)}
        </p>
        <p className="eyebrow">{copy.who}</p>
        <h3 className="text-balance font-extrabold text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
          <TwoBeat beats={copy.title} />
        </h3>
        <p className="text-ink-2 text-lg">{copy.line}</p>
      </div>
      <div ref={stage} className="rounded-[2rem] bg-muted/70 p-4 sm:p-8">
        <Demo play={play} />
      </div>
    </li>
  );
}

/**
 * Spec §3.2. Four steps, each most of a screen on desktop beside a sticky rail of outlined numerals
 * (the active one fills in); on phones they stack along a route line. Each demo plays when it is
 * half in view and replays on the way back.
 */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const { how } = landingCopy;

  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="mx-auto w-full max-w-6xl scroll-mt-14 px-4 pt-20 sm:px-6 lg:grid lg:grid-cols-[7rem_1fr] lg:gap-10 lg:pt-10"
    >
      <h2 id="how-title" className="eyebrow lg:col-span-2">
        {how.eyebrow}
      </h2>
      <div aria-hidden className="hidden lg:block">
        <div className="sticky top-[calc(50svh-9rem)] flex gap-4">
          <div className="relative w-0.5 rounded-full bg-hairline-strong">
            <div
              className="absolute inset-x-0 top-0 rounded-full bg-primary transition-[height] duration-500"
              style={{ height: `${((active + 1) / how.steps.length) * 100}%` }}
            />
          </div>
          <ol className="grid gap-2">
            {how.steps.map((step, index) => (
              <li
                key={step.line}
                className={cn(
                  "font-extrabold text-5xl leading-tight transition-colors duration-300",
                  index === active
                    ? "text-primary"
                    : "text-transparent [-webkit-text-stroke:1.5px_var(--color-muted-foreground)]",
                )}
              >
                {numeral(index)}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <ol className="mt-4 border-hairline-strong border-l-2 lg:mt-0 lg:border-0">
        {how.steps.map((step, index) => (
          <Step key={step.line} index={index} onActive={setActive} />
        ))}
      </ol>
    </section>
  );
}
