"use client";

import { CheckIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib";
import { landingCopy } from "../copy";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { GoalDemo } from "./demos/goal-demo";
import { HandoverDemo } from "./demos/handover-demo";
import { MissionDemo } from "./demos/mission-demo";
import { PurchaseDemo } from "./demos/purchase-demo";
import { TwoBeat } from "./two-beat";

const demos = [HandoverDemo, PurchaseDemo, GoalDemo, MissionDemo] as const;
const numeral = (index: number) => String(index + 1).padStart(2, "0");
/** The header's height: the stage pins just under it. */
const HEADER = 56;
/** How long a finished step stays on screen before the next one slides in. */
const LINGER_MS = 900;

/**
 * Spec §3.2, played rather than watched. Four steps on one stage that pins to the screen: each is a
 * small piece of the app to use (hand over, record, save, answer), and finishing one brings the
 * next. While the stage is pinned and the steps are not all done, scrolling on is held, with a
 * visible Skip. Keyboard scrolling, reduced motion and assistive tech get the plain flow: nothing
 * is held, and the steps are still playable in order.
 */
export function HowItWorks() {
  const { how } = landingCopy;
  const reduced = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [finished, setFinished] = useState<boolean[]>(() => how.steps.map(() => false));
  const [released, setReleased] = useState(false);
  const allDone = finished.every(Boolean);
  const holds = !reduced && !released && !allDone;

  const finish = useCallback((index: number) => {
    setFinished((current) => current.map((value, i) => (i === index ? true : value)));
    window.setTimeout(() => {
      setActive((current) => (current === index ? Math.min(index + 1, demos.length - 1) : current));
    }, LINGER_MS);
  }, []);

  // Hold the page on the stage while it is pinned and unfinished: wheel and touch scrolling
  // down is swallowed; scrolling up always works, and so do the keyboard and Skip.
  useEffect(() => {
    if (!holds) return;
    const element = section.current;
    if (!element) return;
    const pinned = () => {
      const rect = element.getBoundingClientRect();
      return rect.top <= HEADER + 1 && rect.bottom >= window.innerHeight - 1;
    };
    let touchY = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0 && pinned()) event.preventDefault();
    };
    const onTouchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY ?? touchY;
      if (y < touchY && pinned() && event.cancelable) event.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, [holds]);

  const copy = how.steps[active];
  const Demo = demos[active];

  return (
    <section
      ref={section}
      id="how"
      aria-labelledby="how-title"
      className={cn(
        "relative mx-auto w-full max-w-6xl scroll-mt-14 px-4 sm:px-6",
        "lg:grid lg:grid-cols-[9rem_1fr] lg:gap-10",
        !reduced && "min-h-[calc(100svh-3.5rem)] pt-6 lg:pt-8",
        reduced && "pt-20 lg:pt-10",
      )}
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
                    : finished[index]
                      ? "text-teal-300 dark:text-teal-700"
                      : "text-transparent [-webkit-text-stroke:1.5px_var(--color-muted-foreground)]",
                )}
              >
                {numeral(index)}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="relative mt-4 lg:mt-0">
        <span
          aria-hidden
          data-thread-target="mobile"
          className="absolute inset-y-0 -left-4 w-[var(--thread-width,0.625rem)] rounded-full bg-teal-600 data-[thread=travelling]:opacity-0 sm:-left-6 lg:hidden dark:bg-teal-300"
        />
        {/* The step list: one on stage at a time, each in its own live region so a screen reader
            hears the change of step. */}
        <ol aria-label="Steps" className="flex gap-2 pb-4">
          {how.steps.map((step, index) => (
            <li key={step.line} className="flex-1">
              <button
                type="button"
                aria-current={index === active ? "step" : undefined}
                aria-label={`Step ${index + 1}: ${step.title.join(" ")}${finished[index] ? ", done" : ""}`}
                disabled={index > active && !finished[index]}
                onClick={() => setActive(index)}
                className={cn(
                  "flex h-2.5 w-full items-center justify-center rounded-full transition-colors",
                  index === active ? "bg-primary" : finished[index] ? "bg-teal-300" : "bg-muted",
                )}
              />
            </li>
          ))}
        </ol>
        {copy && Demo ? (
          <div
            key={active}
            className="grid gap-6 motion-safe:animate-[rise-in_250ms_var(--ease-brand)_both] lg:grid-cols-[5fr_6fr] lg:items-center lg:gap-16"
          >
            <div className="grid content-start gap-3">
              <p
                aria-hidden
                className="font-extrabold text-6xl text-transparent leading-none [-webkit-text-stroke:1.5px_var(--color-muted-foreground)] lg:hidden"
              >
                {numeral(active)}
              </p>
              <p className="eyebrow">{copy.who}</p>
              <h3 className="text-balance font-extrabold text-3xl leading-[1.05] tracking-[-0.03em] sm:text-5xl">
                <TwoBeat beats={copy.title} />
              </h3>
              <p className="text-ink-2 text-lg">{copy.line}</p>
              {finished[active] ? (
                <p className="flex items-center gap-2 font-semibold text-teal-800 dark:text-teal-100">
                  <CheckIcon aria-hidden className="size-5" />
                  {active === demos.length - 1 ? "That's how Jarso works." : "Done. Next one…"}
                </p>
              ) : null}
            </div>
            <div className="rounded-[2rem] bg-muted/70 p-4 sm:p-8">
              <Demo onDone={() => finish(active)} />
            </div>
          </div>
        ) : null}
        {holds ? (
          <div className="mt-6 flex justify-center">
            <Button type="button" variant="ghost" onClick={() => setReleased(true)}>
              Skip the tour
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
