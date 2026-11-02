"use client";

import { BotIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { guideCopy } from "../copy";

/** With no new line for this long, the bubble starts saying it is still at it. */
const QUIET_MS = 5_000;
/** How often the still-working line changes after that. */
const ROTATE_MS = 3_000;

/**
 * Jarso's reply bubble while the reply is on its way (ADR 0011): the AI chip, three bobbing
 * dots and the latest status line from the server (a phase or a look-up). A long think with no
 * new line turns the line over to "Still thinking…", "Counting carefully…", "Nearly there…" in
 * turn, so the child never watches a line that looks stuck. Only fixed copy, never model text.
 */
export function ThinkingBubble({ status }: { status: string | null }) {
  const [still, setStill] = useState<number | null>(null);

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

  return (
    <div
      role="status"
      className="mr-8 grid w-fit gap-2 rounded-2xl rounded-bl-sm bg-card p-4 shadow-rest"
    >
      <span className="flex w-fit items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 font-semibold text-cyan-700 text-xs dark:bg-cyan-900 dark:text-cyan-300">
        <BotIcon aria-hidden className="size-3.5" />
        {guideCopy.label}
      </span>
      <p className="flex items-center gap-3 text-ink-2">
        <span aria-hidden className="flex items-center gap-1">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-2 rounded-full bg-primary motion-safe:animate-bounce"
              style={{ animationDelay: `${dot * 150}ms` }}
            />
          ))}
        </span>
        {line}
      </p>
    </div>
  );
}
