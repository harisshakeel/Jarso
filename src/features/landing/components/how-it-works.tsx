"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib";
import { landingCopy } from "../copy";
import { useInView } from "../hooks/use-in-view";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { GoalDemo } from "./demos/goal-demo";
import { HandoverDemo } from "./demos/handover-demo";
import { MissionDemo } from "./demos/mission-demo";
import { PurchaseDemo } from "./demos/purchase-demo";
import { TwoBeat } from "./two-beat";

const demos = [HandoverDemo, PurchaseDemo, GoalDemo, MissionDemo] as const;
const numeral = (index: number) => String(index + 1).padStart(2, "0");

function Step({
  index,
  onActive,
  onDone,
}: {
  index: number;
  onActive: (index: number) => void;
  onDone: (index: number) => void;
}) {
  const step = useRef<HTMLLIElement>(null);
  const centred = useInView(step, { threshold: 0, rootMargin: "-45% 0px -45% 0px" });
  const copy = landingCopy.how.steps[index];
  const Demo = demos[index];

  useEffect(() => {
    if (centred) onActive(index);
  }, [centred, index, onActive]);

  if (!copy || !Demo) return null;
  return (
    <li
      ref={step}
      data-step={index}
      className="relative grid gap-8 py-14 pl-5 sm:pl-6 lg:min-h-[80svh] lg:grid-cols-[5fr_6fr] lg:items-center lg:gap-16 lg:py-16 lg:pl-0"
    >
      <span
        aria-hidden
        className="absolute top-[4.25rem] left-[calc(var(--thread-width,0.625rem)/2-1rem)] h-[calc(var(--thread-width,0.625rem)*0.36)] w-[calc(var(--thread-width,0.625rem)*0.84)] -translate-x-1/2 rounded-full bg-gold shadow-[0_calc(var(--thread-width,0.625rem)*0.08)_0_var(--color-teal-800)] sm:left-[calc(var(--thread-width,0.625rem)/2-1.5rem)] lg:hidden"
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
      <div className="rounded-[2rem] bg-muted/70 p-4 sm:p-8">
        <Demo onDone={() => onDone(index)} />
      </div>
    </li>
  );
}

/**
 * Spec §3.2. Four steps, each most of a screen on desktop beside a sticky rail of outlined numerals
 * (the active one fills in, a coin marks it on the line); on phones they stack along a route line.
 * Either line is where the hero jar's unwound outline arrives. Each step is a small piece of the
 * app to play, and the page waits on a step until it is played: scrolling down past an unfinished
 * step is held while it is on screen, scrolling back up always works. Reduced motion, the
 * keyboard and assistive tech get the plain flow with nothing held.
 */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [done, setDone] = useState<boolean[]>(() => landingCopy.how.steps.map(() => false));
  const reduced = useReducedMotion();
  const { how } = landingCopy;
  const holding = !reduced && !done[active];

  useEffect(() => {
    if (!holding) return;
    // The step on stage: hold only while most of it is on screen, so nothing jams elsewhere.
    const onStage = () => {
      const element = document.querySelector<HTMLElement>(`[data-step="${active}"]`);
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight;
      return rect.top <= viewport * 0.35 && rect.bottom >= viewport * 0.65;
    };
    let touchY = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0 && onStage()) event.preventDefault();
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY;
      if (y < touchY - 2 && onStage() && event.cancelable) event.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [holding, active]);

  const finish = (index: number) =>
    setDone((current) => current.map((value, i) => (i === index ? true : value)));

  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="mx-auto w-full max-w-6xl scroll-mt-14 px-4 pt-20 sm:px-6 lg:grid lg:grid-cols-[9rem_1fr] lg:gap-10 lg:pt-10"
    >
      <h2 id="how-title" className="eyebrow lg:col-span-2">
        {how.eyebrow}
      </h2>
      <div aria-hidden className="hidden lg:block">
        <div className="sticky top-[calc(50svh-9rem)] flex gap-4">
          {/* The jar's outline arrives here as the thread (jar-thread.tsx); a coin, drawn like the
              mark's coins (gold, teal rim), marks the step. */}
          <div
            data-thread-target="desktop"
            className="relative w-[var(--thread-width,0.875rem)] shrink-0 rounded-full bg-teal-600 data-[thread=travelling]:opacity-0 dark:bg-teal-300"
          >
            <span
              className="absolute left-1/2 h-[calc(var(--thread-width,0.875rem)*0.36)] w-[calc(var(--thread-width,0.875rem)*0.84)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_calc(var(--thread-width,0.875rem)*0.08)_0_var(--color-teal-800)] transition-[top] duration-500"
              style={{ top: `${((active + 0.5) / how.steps.length) * 100}%` }}
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
      <ol className="relative mt-4 lg:mt-0">
        <span
          aria-hidden
          data-thread-target="mobile"
          className="absolute inset-y-0 -left-4 w-[var(--thread-width,0.625rem)] rounded-full bg-teal-600 data-[thread=travelling]:opacity-0 sm:-left-6 lg:hidden dark:bg-teal-300"
        />
        {how.steps.map((step, index) => (
          <Step key={step.line} index={index} onActive={setActive} onDone={finish} />
        ))}
      </ol>
    </section>
  );
}
