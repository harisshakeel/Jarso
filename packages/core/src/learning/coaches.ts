export const coachIds = ["pip", "bo", "zuzu", "nell"] as const;
export type CoachId = (typeof coachIds)[number];

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
    name: "Pip",
    trait: "curious",
    says: {
      idle: "Let's look closely.",
      hint: "Here's a clue.",
      checkIn: "Just pick what you think.",
    },
  },
  bo: {
    id: "bo",
    name: "Bo",
    trait: "calm",
    says: {
      idle: "Take your time.",
      hint: "A little help.",
      checkIn: "No right or wrong here.",
    },
  },
  zuzu: {
    id: "zuzu",
    name: "Zuzu",
    trait: "cheeky",
    says: {
      idle: "Ooh, a tricky one.",
      hint: "Psst. Here's a hint.",
      checkIn: "Go with your gut.",
    },
  },
  nell: {
    id: "nell",
    name: "Nell",
    trait: "thoughtful",
    says: {
      idle: "Think it through.",
      hint: "Think about this.",
      checkIn: "Whatever you think is fine.",
    },
  },
};

/** A small, stable hash of a string. */
function hash(text: string): number {
  let value = 5381;
  for (let index = 0; index < text.length; index++) {
    value = (value * 33) ^ text.charCodeAt(index);
  }
  return Math.abs(value);
}

/**
 * The coach for a step, always the same one for the same step key, so a replay or a refresh
 * brings the same face back. Content keys only, never anything the child typed.
 */
export function coachFor(stepKey: string): Coach {
  const id = coachIds[hash(stepKey) % coachIds.length] ?? "pip";
  return coaches[id];
}
