import { type CoachId, coachIdFor, coachNames } from "@jarso/core/learning";

// The four coaches' names and what each says at the app's small moments (design.md §7): a
// greeting, an empty state, a goodbye. The lesson lines (around a question) live with the
// learning feature. Child-facing: short, warm, no blame, reading age about 10.

// Names and the picker live in @jarso/core, shared with the lessons.
export { coachIdFor, coachNames };

/** The moments a coach speaks at outside a lesson. */
export type CoachMoment =
  | "signIn"
  | "start"
  | "nextStep"
  | "learn"
  | "nothingMoved"
  | "moneyStory"
  | "nothingNew"
  | "doneForNow"
  | "offline"
  | "lost"
  | "oops";

export const coachLines: Record<CoachMoment, Record<CoachId, string>> = {
  signIn: {
    pip: "Hello again. Ready when you are.",
    bo: "Welcome back. No rush.",
    zuzu: "You're back. Let's go.",
    nell: "Good to see you. Sign in below.",
  },
  start: {
    pip: "New here? Let's get you set up.",
    bo: "Hello. We'll ask your parent to say yes.",
    zuzu: "A new jar friend. Let's go.",
    nell: "First, your nickname and a parent's email.",
  },
  nextStep: {
    pip: "Shall we?",
    bo: "It's here when you are.",
    zuzu: "Bet you can do this one.",
    nell: "One small step at a time.",
  },
  learn: {
    pip: "Which stop today?",
    bo: "One stop at a time.",
    zuzu: "Race you to the next stop.",
    nell: "Each stop builds on the last.",
  },
  nothingMoved: {
    pip: "Nothing has moved yet. Your first allowance will show up here.",
    bo: "Nothing has moved yet. Your first allowance will show up here.",
    zuzu: "Nothing has moved yet. Your first allowance will show up here.",
    nell: "Nothing has moved yet. Your first allowance will show up here.",
  },
  moneyStory: {
    pip: "Your money story starts here.",
    bo: "Your money story starts here.",
    zuzu: "Your money story starts here.",
    nell: "Your money story starts here.",
  },
  nothingNew: {
    pip: "Nothing here yet.",
    bo: "Nothing here yet.",
    zuzu: "Nothing here yet.",
    nell: "Nothing here yet.",
  },
  doneForNow: {
    pip: "See you next time.",
    bo: "Take a break. Your jars will wait.",
    zuzu: "Off already? See you soon.",
    nell: "Come back any time.",
  },
  offline: {
    pip: "You're offline, try again when connected",
    bo: "You're offline, try again when connected",
    zuzu: "You're offline, try again when connected",
    nell: "You're offline, try again when connected",
  },
  lost: {
    pip: "That page rolled away.",
    bo: "That page rolled away.",
    zuzu: "That page rolled away.",
    nell: "That page rolled away.",
  },
  oops: {
    pip: "That didn't load. Let's try again.",
    bo: "That didn't load. Let's try again.",
    zuzu: "That didn't load. Let's try again.",
    nell: "That didn't load. Let's try again.",
  },
};

/** What `coach` says at `moment`. */
export function coachLine(coach: CoachId, moment: CoachMoment): string {
  return coachLines[moment][coach];
}
