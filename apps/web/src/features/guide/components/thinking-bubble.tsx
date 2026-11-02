"use client";

import { guideCopy } from "@jarso/core/guide";
import { useEffect, useState } from "react";
import { JarsoEyes } from "@/components/brand";
import { cn } from "@/lib";
import { useMotionAllowed } from "./motion";

/** With no new line for this long, the bubble starts saying it is still at it. */
const QUIET_MS = 5_000;
/** How often the still-working line changes after that. */
const ROTATE_MS = 3_000;

const lookups = new Set<string>(Object.values(guideCopy.status));

/** Which of the four steps a server line belongs to: reading, looking up, writing, checking. */
export function stepOf(status: string | null): number {
  if (status === null || status === guideCopy.phases.reading) return 0;
  if (lookups.has(status)) return 1;
  if (status === guideCopy.phases.answering) return 2;
  if (status === guideCopy.phases.checking) return 3;
  return 0;
}

/**
 * Jarso's bubble while the reply is on its way (ADR 0011, design.md §8): the jar with coins
 * dropping through its lid and its eyes looking up at them, the latest status line from the
 * server (a phase or a look-up) and a strip of the four steps lighting up as the lines arrive.
 * A check draws itself while the answer is double-checked; reduced motion shows a still jar
 * and the line. A long think with no new line turns the line over to "Still thinking…", "Counting
 * carefully…", "Nearly there…" in turn, so the child never watches a line that looks stuck.
 * Only fixed copy, never model text.
 */
export function ThinkingBubble({
  status,
  size = "md",
}: {
  status: string | null;
  /** The page shows a bigger face. */
  size?: "md" | "lg";
}) {
  const [still, setStill] = useState<number | null>(null);
  const motion = useMotionAllowed();

  // Each new server line resets the quiet timer; after QUIET_MS the still-working lines rotate.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new status line restarts the timer
  useEffect(() => {
    setStill(null);
    const quiet = setTimeout(() => setStill(0), QUIET_MS);
    return () => clearTimeout(quiet);
  }, [status]);
  useEffect(() => {
    if (still === null) return;
    const next = setTimeout(
      () => setStill((n) => ((n ?? 0) + 1) % guideCopy.stillWorking.length),
      ROTATE_MS,
    );
    return () => clearTimeout(next);
  }, [still]);

  const line = still === null ? (status ?? guideCopy.thinking) : guideCopy.stillWorking[still];
  const step = stepOf(status);
  const big = size === "lg";

  return (
    <div
      role="status"
      data-motion={motion ? "on" : "still"}
      className="mr-8 grid w-fit gap-3 rounded-2xl rounded-bl-sm bg-card p-4 shadow-rest"
    >
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <JarsoEyes size={big ? "lg" : "md"} look={motion ? "up" : "ahead"} filling={motion} />
          {motion && step === 3 ? (
            <svg
              aria-hidden
              data-check
              viewBox="0 0 24 24"
              className={cn("absolute -right-2 -bottom-2 text-primary", big ? "size-7" : "size-5")}
            >
              <circle cx="12" cy="12" r="11" fill="var(--card)" />
              <path
                d="M6 12.5 10 16.5 18 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="check-draw"
              />
            </svg>
          ) : null}
        </div>
        <div className="grid gap-2">
          <span className="font-semibold text-cyan-700 text-xs dark:text-cyan-300">
            {guideCopy.label}
          </span>
          <p className={cn("text-ink-2", big && "text-lg")}>
            <span key={line} className="motion-safe:fade-up inline-block">
              {line}
            </span>
          </p>
          <ol aria-label="Steps" className="flex flex-wrap gap-x-3 gap-y-1">
            {guideCopy.steps.map((name, index) => {
              const state = index < step ? "done" : index === step ? "current" : "next";
              return (
                <li
                  key={name}
                  data-step={state}
                  aria-current={state === "current" ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    state === "next" ? "text-ink-2/60" : "text-foreground",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-full",
                      state === "done" && "bg-primary",
                      state === "current" && "motion-safe:pulse-soft bg-primary",
                      state === "next" && "bg-hairline-strong",
                    )}
                  />
                  {name}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
