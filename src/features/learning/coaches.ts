import { type CoachId, coachIdFor, coachNames } from "@/components/brand";

// The lesson coaches' names and what each says around a question (FR06). The drawing lives in
// components/brand; this is the voice. Child-facing: short, warm, no blame.

export type Coach = {
  id: CoachId;
  name: string;
  /** One word for the parent's and the docs' sake. */
  trait: string;
  says: {
    /** Before the child answers. */
    idle: string;
    /** Above the hints once one is shown. */
    hint: string;
    /** The check-in: no right or wrong is shown. */
    checkIn: string;
  };
};

export const coaches: Record<CoachId, Coach> = {
  pip: {
    id: "pip",
    name: coachNames.pip,
    trait: "curious",
    says: {
      idle: "Let's look closely.",
      hint: "Here's a clue.",
      checkIn: "Just pick what you think.",
    },
  },
  bo: {
    id: "bo",
    name: coachNames.bo,
    trait: "calm",
    says: {
      idle: "Take your time.",
      hint: "A little help.",
      checkIn: "No right or wrong here.",
    },
  },
  zuzu: {
    id: "zuzu",
    name: coachNames.zuzu,
    trait: "cheeky",
    says: {
      idle: "Ooh, a tricky one.",
      hint: "Psst. Here's a hint.",
      checkIn: "Go with your gut.",
    },
  },
  nell: {
    id: "nell",
    name: coachNames.nell,
    trait: "thoughtful",
    says: {
      idle: "Think it through.",
      hint: "Think about this.",
      checkIn: "Whatever you think is fine.",
    },
  },
};

/**
 * The coach for a step, always the same one for the same step key, so a replay or a refresh
 * brings the same face back (the same picker every screen uses). Content keys only, never
 * anything the child typed.
 */
export function coachFor(stepKey: string): Coach {
  return coaches[coachIdFor(stepKey)];
}
