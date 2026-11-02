"use client";

import { BotOffIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { useRef } from "react";
import { landingCopy } from "../copy";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { useScrollProgress } from "../hooks/use-scroll-progress";
import { clamp01 } from "../motion";

const chipIcons = [ShieldCheckIcon, BotOffIcon, UsersIcon] as const;

/**
 * Spec §3.5. One sentence whose words light up as it crosses the screen (Karma, Definable); fully
 * lit by the time it reaches the upper third, and always fully lit with reduced motion.
 */
export function LitStatement() {
  const line = useRef<HTMLParagraphElement>(null);
  const reduced = useReducedMotion();
  const progress = useScrollProgress(line, "crossing");
  const { safety } = landingCopy;
  const words = [
    ...safety.lead.split(" ").map((word) => ({ word, lead: true })),
    ...safety.rest.split(" ").map((word) => ({ word, lead: false })),
  ];

  return (
    <section aria-label="Safety" className="mx-auto w-full max-w-5xl px-4 py-28 sm:px-6">
      <p
        ref={line}
        className="text-balance font-extrabold text-4xl leading-[1.1] tracking-[-0.03em] sm:text-6xl"
      >
        {words.map(({ word, lead }, index) => {
          const lit = reduced ? 1 : clamp01(progress * (words.length + 6) - index);
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: words repeat ("No"), order is fixed.
              key={index}
              style={{ opacity: 0.18 + 0.82 * lit }}
              className={lead ? "text-foreground" : "text-ink-2"}
            >
              {word}
              {index < words.length - 1 ? " " : null}
            </span>
          );
        })}
      </p>
      <ul className="mt-10 flex flex-wrap gap-3">
        {safety.chips.map((chip, index) => {
          const Icon = chipIcons[index] ?? ShieldCheckIcon;
          return (
            <li
              key={chip}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-card px-4 font-semibold shadow-rest"
            >
              <Icon aria-hidden className="size-5 text-primary" />
              {chip}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
