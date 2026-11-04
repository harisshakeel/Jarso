import type { ReactNode, Ref } from "react";
import { cn } from "@/lib";

type BlackboardProps = {
  /** "Step 3 of 7". */
  eyebrow: string;
  /** The question, as the board's heading. */
  prompt: ReactNode;
  promptId: string;
  promptRef?: Ref<HTMLHeadingElement>;
  /** A line under the question, like "What do you think happens?". */
  note?: string;
  /** Beside the eyebrow, top right: the Read aloud button. */
  aside?: ReactNode;
  className?: string;
};

/**
 * The question on a chalkboard: a deep teal board in a wooden-looking gold-brown frame, chalk
 * text, and a chalk underline drawn under the question. The same in both themes (a board is
 * dark by nature); teal-50 on teal-950 clears AA many times over.
 */
export function Blackboard({
  eyebrow,
  prompt,
  promptId,
  promptRef,
  note,
  aside,
  className,
}: BlackboardProps) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-2xl border-[6px] border-gold-800 bg-teal-950 p-4 text-teal-50 shadow-raised sm:p-5 dark:border-gold-900",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-sm text-teal-200 uppercase tracking-[0.08em]">{eyebrow}</p>
        {aside}
      </div>
      <h2
        id={promptId}
        ref={promptRef}
        tabIndex={-1}
        className="text-balance font-extrabold text-xl leading-snug outline-none sm:text-2xl"
      >
        {prompt}
      </h2>
      <svg aria-hidden viewBox="0 0 200 8" preserveAspectRatio="none" className="h-2 w-40">
        <path
          d="M2 5 C 30 2, 50 7, 80 4 S 130 2, 160 5 S 190 6, 198 3"
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          className="stroke-teal-50/80"
        />
      </svg>
      {note ? <p className="text-teal-100">{note}</p> : null}
    </div>
  );
}
