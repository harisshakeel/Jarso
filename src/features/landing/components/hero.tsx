"use client";

import Link from "next/link";
import { useRef } from "react";
import { buttonVariants } from "@/components/ui";
import { routes } from "@/config";
import { landingCopy } from "../copy";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useScrollProgress } from "../hooks/use-scroll-progress";
import { segment } from "../motion";
import { captionWindows, HeroScene } from "./hero-scene";

/** With reduced motion the scene holds this frame: both jars, the ring full, the star out. */
const STILL_FRAME = 0.84;

/**
 * Spec §3.1. A tall section with a sticky stage: the headline and both ways in sit over the jar,
 * then scrolling plays the money loop and its captions. Reduced motion gets one screen: a still
 * frame and the captions as a list.
 */
export function Hero() {
  const section = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const scrolled = useScrollProgress(section, "pinned", 0.18);
  const progress = reduced ? STILL_FRAME : scrolled;
  const intro = reduced ? 1 : 1 - segment(scrolled, 0, 0.06);
  const { hero } = landingCopy;
  // Words repeat ("some."), so each keeps its position as its key.
  const words = hero.title.split(" ").map((word, position) => ({ word, position }));

  return (
    <section
      ref={section}
      aria-labelledby="hero-title"
      className="-mt-14 motion-safe:h-[320svh] motion-safe:lg:h-[450svh]"
    >
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden px-4 pt-14 motion-reduce:relative motion-reduce:h-auto motion-reduce:min-h-svh motion-reduce:pb-10 sm:px-6">
        <div
          style={{ opacity: intro, translate: `0 ${(1 - intro) * -24}px` }}
          className="mx-auto grid max-w-3xl shrink-0 gap-4 pt-8 text-center sm:pt-12"
        >
          <h1
            id="hero-title"
            className="text-balance font-extrabold text-[2.75rem] leading-[1.02] tracking-[-0.035em] sm:text-6xl lg:text-7xl"
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
          <p className="mx-auto max-w-md text-balance text-ink-2 text-lg sm:text-xl">{hero.line}</p>
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

        <div className="relative mx-auto min-h-56 w-full max-w-4xl flex-1 motion-reduce:h-[50svh] motion-reduce:flex-none">
          <HeroScene progress={progress} />
        </div>

        <div className="relative h-16 shrink-0 sm:h-20">
          <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
            {hero.captions.map((caption, index) => {
              const [start, end] = captionWindows[index] ?? [0, 0];
              const shown =
                segment(progress, start, start + 0.02) * (1 - segment(progress, end - 0.02, end));
              return (
                <p
                  key={caption}
                  style={{ opacity: shown, translate: `0 ${(1 - shown) * 10}px` }}
                  className="absolute inset-x-0 top-0 text-balance text-center font-extrabold text-2xl tracking-[-0.02em] sm:text-3xl"
                >
                  {caption}
                </p>
              );
            })}
          </div>
        </div>

        <ol className="sr-only motion-reduce:not-sr-only motion-reduce:mx-auto motion-reduce:grid motion-reduce:max-w-md motion-reduce:gap-1 motion-reduce:text-center motion-reduce:font-bold">
          {hero.captions.map((caption) => (
            <li key={caption}>{caption}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
