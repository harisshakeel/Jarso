"use client";

import Link from "next/link";
import { useRef } from "react";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { landingCopy } from "../copy";
import { useInView } from "../hooks/use-in-view";
import { useThreadState } from "../hooks/use-thread-state";
import { useTimeline } from "../hooks/use-timeline";
import { drop, easeInOut, easeOut, easeOutBack, lerp, segment } from "../motion";
import { CoinArt, JarArt, PILE } from "./jar-art";
import { TwoBeat } from "./two-beat";

/**
 * Spec §3.6: both ways in, beside the jar, the end of the page thread. The thread (jar-thread.tsx)
 * runs down the page into this jar and draws its outline; once the outline is whole, coins drop in
 * and the lid lands. With no thread (reduced motion) the jar draws itself when it comes into view.
 */
export function YourTurn() {
  const jar = useRef<HTMLDivElement>(null);
  const thread = useThreadState(jar);
  const inView = useInView(jar, { threshold: 0.6 });
  const threaded = thread !== "none";
  const t = useTimeline(threaded ? thread === "drawn" : inView, 2400);
  // The thread brings the outline whole, so its coins start at once; on its own the jar first
  // spends 800 ms drawing the outline.
  const clock = threaded ? t + 700 : t;
  const draw = threaded ? (thread === "drawn" ? 1 : 0) : easeInOut(segment(t, 0, 800));
  const drops = [0, 1, 2, 3].map((k) => ({
    k,
    d: segment(clock, 700 + k * 220, 1150 + k * 220),
  }));
  const landed = drops.filter(({ d }) => d >= 1).length;
  const lidIn = easeOut(segment(clock, 1800, 2050));
  const lidCoinIn = easeOutBack(segment(clock, 2000, 2250));
  const { turn } = landingCopy;

  return (
    <section aria-labelledby="turn-title" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid items-center gap-10 rounded-[2.5rem] bg-card p-8 shadow-raised sm:p-14 md:grid-cols-[1fr_auto]">
        <div className="grid gap-8">
          <h2
            id="turn-title"
            className="text-balance font-extrabold text-4xl leading-[1.05] tracking-[-0.03em] sm:text-6xl"
          >
            <TwoBeat beats={turn.title} />
          </h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href={routes.signup}
              className={buttonVariants({ variant: "keycap", size: "lg" })}
            >
              {turn.parentCta}
            </Link>
            <Link
              href={routes.childStart}
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              {turn.kidCta}
            </Link>
          </div>
        </div>
        {/* Sized from the thread's width, so this jar's stroke is the hero jar's (64 units of 432). */}
        <div
          ref={jar}
          data-thread-end
          className="mx-auto w-[calc(var(--thread-width,1.778rem)*6.75)] sm:w-[calc(var(--thread-width,2.222rem)*6.75)]"
        >
          <svg viewBox="40 -90 432 590" className="w-full overflow-visible" aria-hidden>
            <JarArt
              cx={256}
              cy={256}
              scale={1}
              tone="spend"
              coins={landed}
              draw={draw}
              lidIn={lidIn}
              lidCoin
              lidCoinIn={lidCoinIn}
            />
            {drops.map(({ k, d }) => {
              if (d <= 0 || d >= 1) return null;
              const [x, y] = PILE[k] ?? [0, 0];
              return <CoinArt key={k} x={x} y={lerp(-80, y, drop(d))} />;
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
