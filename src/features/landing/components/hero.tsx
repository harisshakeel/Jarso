"use client";

import Link from "next/link";
import { useRef } from "react";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { cn } from "@/lib";
import { landingCopy } from "../copy";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useScrollProgress } from "../hooks/use-scroll-progress";
import { segment } from "../motion";
import { captionWindows, HeroScene, taglineStarts, taglinesLeave } from "./hero-scene";
import { JarThread } from "./jar-thread";

/** With reduced motion the scene holds the answer to the question: both jars, the Save ring full. */
const STILL_FRAME = 0.9;

/** Centred over the scene, where the H1 was: the last tagline, then act 2's captions. */
const OVER_SCENE = "inset-x-0 top-[27%] text-center lg:top-[17%]";

/** Where each tagline pops up: left and right of the falling coins, then centred over the jar. */
const taglinePlaces = [
  "left-4 top-[35%] text-left sm:left-[8%] lg:top-[40%]",
  "right-4 top-[44%] text-right sm:right-[8%] lg:top-[53%]",
  OVER_SCENE,
] as const;

/**
 * Spec §3.1. A tall section with a sticky stage, its content centred. The opening frame is the kid,
 * the question and both ways in; scrolling plays the toss while the taglines pop up beside the
 * coins, then the savings loop with its captions where the question was. Reduced motion gets one screen: a still frame and
 * every line as a list.
 */
export function Hero() {
  const section = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const scrolled = useScrollProgress(section, "pinned", 0.18);
  const progress = reduced ? STILL_FRAME : scrolled;
  const intro = reduced ? 1 : 1 - segment(scrolled, 0, 0.05);
  const leaving = 1 - segment(progress, ...taglinesLeave);
  const { hero } = landingCopy;
  // Words repeat ("some."), so each keeps its position as its key.
  const words = hero.title.split(" ").map((word, position) => ({ word, position }));

  return (
    <section
      ref={section}
      aria-labelledby="hero-title"
      className="-mt-14 motion-safe:h-[420svh] motion-safe:lg:h-[600svh]"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-4 pt-14 motion-reduce:relative motion-reduce:h-auto motion-reduce:min-h-svh motion-reduce:py-24 sm:px-6">
        <div className="relative mx-auto w-full max-w-3xl shrink-0">
          <div
            style={{ opacity: intro, translate: `0 ${(1 - intro) * -24}px` }}
            className="grid gap-4 text-center"
          >
            <h1
              id="hero-title"
              className="text-balance font-extrabold text-[2.5rem] leading-[1.04] tracking-[-0.035em] sm:text-6xl lg:text-[4.25rem]"
            >
              <span className="sr-only">{hero.title}</span>
              <span aria-hidden>
                {words.map(({ word, position }) => (
                  <span key={position}>
                    <span
                      style={{ animationDelay: `${position * 60}ms` }}
                      className="inline-block motion-safe:animate-[word-rise_700ms_cubic-bezier(0.16,1,0.3,1)_both]"
                    >
                      {word}
                    </span>
                    {position < words.length - 1 ? " " : null}
                  </span>
                ))}
              </span>
            </h1>
            <div inert={intro < 0.05} className="mt-2 flex flex-wrap justify-center gap-3">
              <Link
                href={routes.signup}
                className={buttonVariants({ variant: "keycap", size: "lg" })}
              >
                {hero.parentCta}
              </Link>
              <Link
                href={routes.childSignIn}
                className={buttonVariants({ variant: "outline", size: "lg" })}
              >
                {hero.kidCta}
              </Link>
            </div>
          </div>
        </div>

        {/* Sized by the scene's frame (640 × 390), so the H1, buttons and kid centre as one block. */}
        <div className="relative mx-auto aspect-[640/390] max-h-[calc(100svh-20rem)] w-full max-w-4xl">
          <HeroScene progress={progress} />
        </div>

        <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
          {hero.taglines.map((line, index) => {
            const start = taglineStarts[index] ?? 0;
            const shown = segment(progress, start, start + 0.025) * leaving;
            const from = index === 0 ? -1 : index === 1 ? 1 : 0;
            return (
              <p
                key={line}
                style={{
                  opacity: shown,
                  translate: `${(1 - shown) * from * 40}px ${(1 - shown) * 18}px`,
                  scale: `${0.94 + 0.06 * shown}`,
                  filter: shown < 1 ? `blur(${(1 - shown) * 6}px)` : undefined,
                }}
                className={cn(
                  "absolute font-extrabold text-4xl leading-[1.05] tracking-[-0.035em] sm:text-6xl lg:text-7xl",
                  taglinePlaces[index],
                  index === hero.taglines.length - 1 && "text-primary",
                )}
              >
                {line}
              </p>
            );
          })}
          {hero.captions.map((caption, index) => {
            const [start, end] = captionWindows[index] ?? [0, 0];
            const shown =
              segment(progress, start, start + 0.02) * (1 - segment(progress, end - 0.02, end));
            return (
              <p
                key={caption}
                style={{ opacity: shown, translate: `0 ${(1 - shown) * 14}px` }}
                className={cn(
                  "absolute text-balance px-4 font-extrabold text-3xl tracking-[-0.03em] sm:text-5xl",
                  OVER_SCENE,
                )}
              >
                {caption}
              </p>
            );
          })}
        </div>

        <ol
          aria-label="What the animation shows"
          className="sr-only motion-reduce:not-sr-only motion-reduce:mx-auto motion-reduce:grid motion-reduce:max-w-md motion-reduce:gap-1 motion-reduce:text-center motion-reduce:font-bold"
        >
          {[...hero.taglines, ...hero.captions].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </div>
      <JarThread progress={progress} />
    </section>
  );
}
