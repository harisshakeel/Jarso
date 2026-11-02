import { cn } from "cn";
import type { ReactNode } from "react";
import { CoachFigure, type CoachId } from "./coach-figure";
import { type CoachMoment, coachIdFor, coachLine, coachNames } from "./coaches";

type CoachSaysProps = {
  /** Which coach, or the key to pick one by (a page or moment key; never the child's words). */
  coach: CoachId | { key: string };
  /** The line, or the moment to say this coach's line for. */
  says: ReactNode | { moment: CoachMoment };
  /** `md` is the lesson coach with its name; `sm` is a small aside, the name only for AT. */
  size?: "sm" | "md";
  /** Anything that belongs under the line inside the bubble (a button, a second line). */
  children?: ReactNode;
  className?: string;
};

/**
 * A coach with a speech bubble, the same piece on every screen a coach appears on (design.md
 * §6, §7): a greeting on sign-in, the next step on Home, an empty state, a goodbye. One coach per
 * screen, chosen by a stable key so the page keeps its coach. Server-safe; nothing moves.
 */
export function CoachSays({ coach, says, size = "md", children, className }: CoachSaysProps) {
  const id = typeof coach === "string" ? coach : coachIdFor(coach.key);
  const name = coachNames[id];
  const line =
    says !== null && typeof says === "object" && "moment" in says
      ? coachLine(id, says.moment)
      : says;
  const small = size === "sm";
  return (
    <div data-coach-says={id} className={cn("flex items-end gap-3", className)}>
      <figure className="grid shrink-0 justify-items-center gap-1">
        <CoachFigure coach={id} size={small ? 44 : 88} label={small ? name : undefined} />
        {small ? null : (
          <figcaption className="font-semibold text-ink-2 text-sm">{name}</figcaption>
        )}
      </figure>
      <div
        className={cn(
          "relative min-w-0 flex-1 rounded-2xl rounded-bl-sm bg-secondary",
          "before:absolute before:-left-2 before:bottom-3 before:size-4 before:rotate-45 before:bg-secondary",
          small ? "mb-1 px-3 py-2" : "mb-6 p-4",
        )}
      >
        <p className={cn("font-semibold", small && "text-base")}>{line}</p>
        {children}
      </div>
    </div>
  );
}
