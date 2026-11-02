"use client";

import { LightbulbIcon } from "lucide-react";
import type { ReactNode } from "react";
import { type CoachReaction, JarCoach } from "@/components/brand";
import { cn } from "@/lib";
import type { Coach } from "../coaches";
import { renderText } from "../text";

type CoachBubbleProps = {
  coach: Coach;
  /** Hints the child has asked for so far, in order. */
  hints: string[];
  currency: string;
  /** The check-in shows no hints or feedback: the coach just keeps the child company. */
  checkIn?: boolean;
  reaction?: CoachReaction;
  /** The feedback panel once the child has answered; it takes the bubble over. */
  children?: ReactNode;
};

/**
 * A coach beside the question, Duolingo-style: the jar with a face on the left and a speech
 * bubble that says one short line before the child answers, holds the hints they ask for, and
 * carries the feedback once they have answered. The coach cheers for a right answer and nods
 * for a wrong one; reduced motion keeps it still.
 */
export function CoachBubble({
  coach,
  hints,
  currency,
  checkIn = false,
  reaction = null,
  children,
}: CoachBubbleProps) {
  const line = checkIn ? coach.says.checkIn : hints.length > 0 ? coach.says.hint : coach.says.idle;
  return (
    <div className="flex items-end gap-3">
      <figure className="grid shrink-0 justify-items-center gap-1">
        <JarCoach coach={coach.id} size={88} reaction={reaction} />
        <figcaption className="font-semibold text-ink-2 text-sm">{coach.name}</figcaption>
      </figure>
      <div
        data-bubble
        className={cn(
          "relative mb-6 min-w-0 flex-1 rounded-2xl rounded-bl-sm bg-secondary p-4",
          "before:absolute before:-left-2 before:bottom-3 before:size-4 before:rotate-45 before:bg-secondary",
        )}
      >
        {!children ? <p className="font-semibold">{line}</p> : null}
        {!checkIn && hints.length > 0 ? (
          <div className="grid gap-2">
            {!children ? null : <p className="font-semibold">{coach.says.hint}</p>}
            <ul className="grid gap-2" aria-label="Hints">
              {hints.map((hint) => (
                <li
                  key={hint}
                  className="flex gap-2 rounded-xl bg-gold-100 p-3 text-gold-700 dark:bg-gold-900 dark:text-gold"
                >
                  <LightbulbIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
                  <span className="font-semibold">{renderText(hint, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {/* Always in the page, so screen readers announce the feedback when it appears. */}
        <div
          role="status"
          aria-live="polite"
          className={cn(children && hints.length > 0 && "mt-3")}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
