import type { CoachId } from "@jarso/core/learning";

/** A child's welcome tour: the buddy they picked (null before), and when they finished it. */
export type TourState = { buddy: CoachId | null; finishedAt: string | null };
