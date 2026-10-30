"use client";

import Link from "next/link";
import { useRef } from "react";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { landingCopy } from "../copy";
import { useInView } from "../hooks/use-in-view";
import { useTimeline } from "../hooks/use-timeline";
import { drop, easeInOut, easeOut, lerp, segment } from "../motion";
import { CoinArt, JarArt, PILE } from "./jar-art";
import { TwoBeat } from "./two-beat";

/** Spec §3.6: both ways in, beside the jar. Three coins drop in once when it comes into view. */
export function YourTurn() {
  const jar = useRef<HTMLDivElement>(null);
  const play = useInView(jar, { threshold: 0.6 });
  const t = useTimeline(play, 1700);
  const drops = [0, 1, 2].map((k) => ({ k, d: segment(t, 200 + k * 260, 700 + k * 260) }));
  const landed = drops.filter(({ d }) => d >= 1).length;
  const lidOpen = easeOut(segment(t, 0, 200)) * (1 - easeInOut(segment(t, 1300, 1550)));
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
        <div ref={jar} className="mx-auto w-48 sm:w-60">
          <svg viewBox="40 -90 432 590" className="w-full overflow-visible" aria-hidden>
            <JarArt
              cx={256}
              cy={256}
              scale={1}
              tone="spend"
              coins={3 + landed}
              lidOpen={lidOpen}
              lidCoin
            />
            {drops.map(({ k, d }) => {
              if (d <= 0 || d >= 1) return null;
              const [x, y] = PILE[3 + k] ?? [0, 0];
              return <CoinArt key={k} x={x} y={lerp(-80, y, drop(d))} />;
            })}
          </svg>
        </div>
      </div>
    </section>
  );
}
