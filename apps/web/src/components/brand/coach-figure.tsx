import { type CoachId, coachIds } from "@jarso/core/learning";
import { cn } from "cn";
import { KID_ASPECT, KID_VIEWBOX, KidFigure, type KidLook, type KidMood } from "./kid-figure";

// The four coaches (design.md §7): kids drawn like the hero's kid, each with their own hair,
// skin, hoodie and way of holding their coins. Server-safe: no hooks.

// The ids live in @jarso/core so the lessons agree on them.
export { type CoachId, coachIds };

/** A one-off move when something happens: a cheer for a right answer, a nod for a wrong one. */
export type CoachReaction = "cheer" | "nod" | null;

const hero = {
  trousersClass: "stroke-teal-700 dark:stroke-teal-400",
  shoesClass: "stroke-teal-900 dark:stroke-teal-100",
};

export const coachLooks: Record<CoachId, KidLook> = {
  // Pip, a girl, curious: ginger bunches, a light hoodie, holding one coin up to look at it.
  pip: {
    hair: "bunches",
    hairClass: "fill-hair-3",
    skinClass: "fill-skin-2",
    topClass: "stroke-teal-200",
    trousersClass: "stroke-teal-600 dark:stroke-teal-400",
    shoesClass: hero.shoesClass,
    accessory: null,
    arms: { right: 62, left: 12, reach: 0.78 },
    coins: { where: "right-hand", count: 1 },
  },
  // Bo, the hero's boy, calm: brown crop, the cyan hoodie, a handful of coins cupped in both hands.
  bo: {
    hair: "crop",
    hairClass: "fill-hair-1",
    skinClass: "fill-skin-1",
    topClass: "stroke-cyan-300",
    trousersClass: hero.trousersClass,
    shoesClass: hero.shoesClass,
    accessory: null,
    arms: { right: -10, left: 10, reach: 0.68 },
    coins: { where: "cupped", count: 3 },
  },
  // Zuzu, a boy, cheeky: black curls, a teal top with a sticker, one arm up flipping a coin.
  zuzu: {
    hair: "curls",
    hairClass: "fill-hair-2",
    skinClass: "fill-skin-3",
    topClass: "stroke-teal-500",
    trousersClass: "stroke-teal-800 dark:stroke-teal-300",
    shoesClass: "stroke-teal-100 dark:stroke-teal-900",
    accessory: "sticker",
    arms: { right: 150, left: 14, reach: 0.92 },
    coins: { where: "right-hand", count: 1 },
  },
  // Nell, a girl, thoughtful: a dark bob with a hairband, round glasses, two coins held close.
  nell: {
    hair: "bob",
    hairClass: "fill-hair-4",
    skinClass: "fill-skin-4",
    topClass: "stroke-teal-300",
    trousersClass: "stroke-teal-800 dark:stroke-teal-500",
    shoesClass: hero.shoesClass,
    accessory: "glasses",
    arms: { right: -8, left: 8, reach: 0.7 },
    coins: { where: "cupped", count: 2 },
  },
};

/** The kid's face for a reaction: a cheer opens the mouth, a nod brings the unsure wave. */
export function moodFor(reaction: CoachReaction): KidMood {
  return reaction === "cheer" ? "cheer" : reaction === "nod" ? "unsure" : "smile";
}

type CoachFigureProps = {
  coach: CoachId;
  /** Rendered height in px; the width follows the figure. */
  size?: number;
  reaction?: CoachReaction;
  /** Accessible name. Omit when the coach's name is written beside it (decorative). */
  label?: string;
  className?: string;
};

/**
 * One of the four coaches: a kid drawn like the hero's kid. A `reaction` plays once (design.md
 * §8: nothing loops) and sets the face; reduced motion shows the still kid with that face.
 */
export function CoachFigure({
  coach,
  size = 96,
  reaction = null,
  label,
  className,
}: CoachFigureProps) {
  return (
    <svg
      viewBox={KID_VIEWBOX}
      width={Math.round(size * KID_ASPECT)}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-coach={coach}
      data-reaction={reaction ?? undefined}
      className={cn(
        "shrink-0 select-none overflow-visible",
        reaction === "cheer" && "motion-safe:animate-[coach-cheer_700ms_var(--ease-brand)_both]",
        reaction === "nod" && "motion-safe:animate-[coach-nod_500ms_var(--ease-brand)_both]",
        className,
      )}
    >
      <KidFigure look={coachLooks[coach]} mood={moodFor(reaction)} />
    </svg>
  );
}

/** The coaches were jars once; callers that still say so get the kids. */
export { CoachFigure as JarCoach };

/** The box round a coach's head and shoulders, in the kid's own units. */
const HEAD_VIEWBOX = "-60 -266 120 120";

/**
 * A coach's head and shoulders (2026-11-05), for a small round badge beside a name, where the
 * whole kid would be too small to read. Decorative unless `label` is given.
 */
export function CoachHead({
  coach,
  size = 24,
  label,
  className,
}: Omit<CoachFigureProps, "reaction">) {
  return (
    <svg
      viewBox={HEAD_VIEWBOX}
      width={size}
      height={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-coach={coach}
      className={cn("shrink-0 select-none", className)}
    >
      <KidFigure look={coachLooks[coach]} />
    </svg>
  );
}
