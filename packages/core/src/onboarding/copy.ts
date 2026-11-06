import type { Frequency } from "../allowance";
import type { GoalEmoji } from "../goals";

// Every word of the child's intro. Labels 1–3 words, Jarso's bubble at most 8, no paragraphs.

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const PERIOD: Record<Frequency, string> = {
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  annual: "year",
};

/** The goal step's picks. The child can rename it later in the goal sheet. */
export const ONBOARDING_GOALS: readonly { emoji: GoalEmoji; name: string }[] = [
  { emoji: "🎮", name: "Game" },
  { emoji: "⚽", name: "Boots" },
  { emoji: "🎧", name: "Headphones" },
  { emoji: "📚", name: "Books" },
  { emoji: "🚲", name: "Bike" },
  { emoji: "🎁", name: "A gift" },
];

export const onboardingCopy = {
  practiceTag: "PRACTICE",
  practiceLabel: "Practice money, not real",
  skip: "Skip",
  next: "Next",
  stepLabel: (n: number, total: number) => `Step ${n} of ${total}`,
  meet: {
    hello: (name: string | null) => (name ? `Hi ${name}! I'm Jarso.` : "Hi! I'm Jarso."),
    heading: "I help your money grow. Ready?",
    go: "Let's go!",
  },
  spend: {
    heading: "This is Spend",
    sub: "Money in your pocket.",
    caption: "In your pocket",
    ask: (price: string) => `Bought a snack for ${price}? Tap it!`,
    snack: (price: string) => `Snack ${price}`,
    hint: "Tap the snack",
    done: "Written down. Jar stays true!",
  },
  save: {
    heading: "This is Save",
    sub: (parent: string) => `${capitalise(parent)} keeps it safe for you.`,
    ask: "Drag a coin into Save!",
    coin: "Move a coin to Save",
    done: "Save is growing!",
    realWorld: (parent: string) => `For real, you hand the cash to ${parent}.`,
    spendLabel: (amount: string) => `Spend ${amount}`,
    saveLabel: (amount: string) => `Save ${amount}`,
  },
  goal: {
    heading: "Save for something",
    sub: "Pick one. You can change it.",
    costLabel: "It costs about",
    plan: (amount: string, frequency: Frequency) => `With ${amount} a ${PERIOD[frequency]}`,
    weeks: (n: number) => `About ${n} ${n === 1 ? "week" : "weeks"}`,
    submit: "Set my goal",
    notNow: "Not now",
    keep: "Keep my goal",
    yours: "Your goal",
  },
  look: {
    heading: "Make Jarso yours",
    done: "Done!",
  },
  done: {
    title: "You're in!",
    sparks: (n: number) => `+${n}`,
    badge: "First badge",
    go: "See my jars",
  },
  replay: "Replay the intro",
} as const;
