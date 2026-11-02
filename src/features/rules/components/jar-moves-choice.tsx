"use client";

import { useId, useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { runOnline } from "@/features/offline";
import { cn } from "@/lib";
import { jarMovesSentence } from "../describe";
import { setJarMovesAction } from "../server/actions";
import type { JarMovesMode } from "../types";

type JarMovesChoiceProps = { childId: string; nickname: string; mode: JarMovesMode };

const OPTIONS: { mode: JarMovesMode; label: string }[] = [
  { mode: "ask", label: "Ask me first" },
  { mode: "notify", label: "Just tell me" },
];

/**
 * How the child moves money between their own jars (design.md §6, a rule as a sentence): ask
 * first, so a request waits for the parent's yes and hand-over, or just tell them, so the move
 * is recorded at once and the parent gets a note. Extra money always asks.
 */
export function JarMovesChoice({ childId, nickname, mode }: JarMovesChoiceProps) {
  const id = useId();
  const [chosen, setChosen] = useState(mode);
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ code: string; message: string }>();

  function choose(next: JarMovesMode) {
    if (next === chosen) return;
    const previous = chosen;
    setChosen(next);
    setError(undefined);
    start(async () => {
      const result = await runOnline(() => setJarMovesAction(null, { childId, mode: next }));
      // After an await, updates leave the transition unless wrapped again (see rule-row.tsx).
      start(() => {
        if (!result.ok) {
          setChosen(previous);
          setError(result.error);
        }
      });
    });
  }

  return (
    <div className="grid gap-3">
      <p className="font-semibold">{jarMovesSentence(chosen, nickname)}</p>
      <fieldset className="flex flex-wrap gap-2" disabled={pending}>
        <legend className="sr-only">When {nickname} moves money between jars</legend>
        {OPTIONS.map((option) => {
          const checked = option.mode === chosen;
          return (
            <label
              key={option.mode}
              className={cn(
                "flex min-h-11 cursor-pointer items-center rounded-full border px-4 font-semibold transition-colors has-focus-visible:outline-3 has-focus-visible:outline-ring has-focus-visible:outline-offset-2",
                checked
                  ? "border-primary bg-secondary text-secondary-foreground"
                  : "border-hairline-strong bg-card text-foreground hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name={`${id}-mode`}
                value={option.mode}
                checked={checked}
                onChange={() => choose(option.mode)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </fieldset>
      <p className="text-ink-2 text-sm">
        {chosen === "notify"
          ? "Take-outs and put-ins are recorded at once and you get a note each time. Asking for extra money still waits for you."
          : "Take-outs wait for your yes and the hand-over; put-ins wait until you have the cash."}
      </p>
      <FormError error={error} />
    </div>
  );
}
