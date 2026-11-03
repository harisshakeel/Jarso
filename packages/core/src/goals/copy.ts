import type { Move, Prediction } from "./predict";
import { goalProgress } from "./progress";

/** What a child sees when `save_goal` refuses the plan (SQLSTATE 22023, message is the key). */
export const PLAN_MESSAGES: Record<string, string> = {
  plan_over_allowance: "That's more than your allowance. Try a smaller amount.",
  plan_over_target: "That's more than your goal costs. Try a smaller amount.",
};

/** "About N more allowances", or a nudge to set a plan. Pure arithmetic; never writes. */
export function previewLine(input: {
  targetMinor: number;
  /** Counted Save: Save less money waiting to come out of it. */
  savedMinor: number;
  planMinor: number | null;
  currency: string;
}): string {
  const progress = goalProgress({
    saveMinor: input.savedMinor,
    reservedMinor: 0,
    targetMinor: input.targetMinor,
    planMinor: input.planMinor,
  });
  if (progress.reached) return "You've already saved enough for this.";
  if (progress.paymentsLeft === null) {
    return "Set how much you'll save each time to see how long it'll take";
  }
  return progress.paymentsLeft === 1
    ? "About 1 more allowance"
    : `About ${progress.paymentsLeft} more allowances`;
}

/** The child's guess in the predict step (FR05). */
export const PREDICT_LABEL: Record<Prediction, string> = {
  further: "Further off",
  same: "Stays the same",
  closer: "Closer",
};

/** The predict step's question for each move (FR05). */
export const PREDICT_QUESTION: Record<Move, string> = {
  take_out: "If you take this out, what happens to your goal?",
  put_in: "If you put this in, what happens to your goal?",
  change_plan: "With this plan, what happens to your goal?",
};

/** Goal sheet, card, staircase, new-goal dialog and celebration copy (FR02, FR05). */
export const goalCopy = {
  sheet: {
    triggerNew: "Set a goal",
    triggerChange: "Change my goal",
    titleNew: "Something to save for",
    titleChange: "Your goal",
    description: "Pick something you want and how much it costs.",
    nameLabel: "What is it?",
    emojiLegend: "Pick a picture",
    targetLabel: "How much does it cost?",
    planLabel: "How much will you save each time?",
    /** "Up to ₹50 from each allowance." `amount` is already formatted. */
    planHint: (amount: string) => `Up to ${amount} from each allowance.`,
    submit: "Save my goal",
  },
  newGoal: {
    trigger: "Start a new goal",
    title: "Start a new goal?",
    description: "This goal closes. Your money stays in Save.",
    cancel: "Keep this goal",
    confirm: "Yes, start a new goal",
  },
  predict: {
    right: "That's it. ",
    wrong: "Not quite. ",
    tryAnother: "Try another amount. Nothing moves until you decide.",
    useAmount: "Use this amount",
  },
  card: {
    heading: "Your goal",
    seeIt: "See it",
    empty: "Something to save for? Pick it and see the climb.",
    /** "⚽ Football boots, ₹450." `target` is already formatted. */
    title: (emoji: string, name: string, target: string) => `${emoji} ${name}, ${target}.`,
    /** "£34 of £60" on the phone goal card. Amounts are already formatted. */
    ofTarget: (saved: string, target: string) => `${saved} of ${target}`,
  },
  staircase: {
    amountsSummary: "The amounts",
    /** "₹26 saved · ₹19 to go · ₹4 each allowance". Amounts are already formatted. */
    amounts: (saved: string, toGo: string, plan: string | null) =>
      `${saved} saved · ${toGo} to go${plan ? ` · ${plan} each allowance` : ""}`,
  },
  home: {
    goalReachedEyebrow: "Goal reached",
    doThisNext: "Do this next",
    /** "Saved up. ⚽ Football boots." */
    reachedTitle: (emoji: string, name: string) => `Saved up. ${emoji} ${name}.`,
    reachedBody: "You did it by saving a bit each time.",
    askToUse: "Ask to use my savings",
    approvedTitle: "Your parent said yes",
    /** "₹20 from Save, coming soon." `amount` is already formatted. */
    approvedBody: (amount: string) => `${amount} from Save, coming soon.`,
    setGoalTitle: "Something to save for?",
    setGoalBody: "Pick something you want and how much it costs.",
    allDoneTitle: "All done for today.",
    allDoneBody: "Your jars are up to date. Come back any time.",
  },
} as const;
