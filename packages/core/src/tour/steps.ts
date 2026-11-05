// The child's welcome tour (2026-11-06, demo 3 feedback): the buddy they pick walks them round
// Home, then hops through each tab, pointing at one thing at a time like a game tutorial. The
// script lives here so the phone can tell the same story. Nothing in the tour changes money:
// every "tap" step only opens a tab. Child-facing words: short, warm, a bit excited.
import { type CoachId, coachNames } from "@jarso/core/learning";

/** What a step points at. The web marks each with `data-tour="<target>"`. */
export type TourTarget =
  | "streak"
  | "next-step"
  | "road"
  | "spend"
  | "save"
  | "goal"
  | "tab-diary"
  | "tab-learn"
  | "tab-jarso"
  | "tab-inbox"
  | "diary"
  | "learn"
  | "inbox";

/** The tabs a step can send the child to. */
export type TourTab = "diary" | "learn" | "jarso" | "inbox";

/** Who is talking: the buddy, or Jarso popping in on its own tab. */
export type TourSpeaker = "buddy" | "jarso";

type Words = { name: string; buddy: string };

export type TourStep =
  /** The four kids line up; the child taps one to be their buddy. */
  | { id: "pick"; kind: "pick"; say: (w: Words) => string }
  /** The buddy explains what is glowing; the child taps Next. */
  | { id: string; kind: "say"; target: TourTarget | null; say: (w: Words) => string; next?: string }
  /**
   * The buddy points at a tab and the child taps it themselves. Once the tab opens, `arrive`
   * explains what is there (spoken by `arrive.speaker`), and Next moves on.
   */
  | {
      id: string;
      kind: "tap";
      tab: TourTab;
      target: TourTarget;
      say: (w: Words) => string;
      arrive: { target: TourTarget | null; speaker: TourSpeaker; say: (w: Words) => string };
    }
  /** Back on Home: a cheer, and Let's go. */
  | { id: "finish"; kind: "finish"; say: (w: Words) => string; next: string };

export const tourSteps: readonly TourStep[] = [
  {
    id: "pick",
    kind: "pick",
    say: ({ name }) => `Hi ${name}! Pick a buddy to show you around.`,
  },
  {
    id: "hello",
    kind: "say",
    target: null,
    say: ({ name, buddy }) => `Hey ${name}, I'm ${buddy}! Let's check out your money world.`,
    next: "Let's go!",
  },
  {
    id: "streak",
    kind: "say",
    target: "streak",
    say: () => "This flame is your run. Learn a little every day and watch it grow!",
  },
  {
    id: "next-step",
    kind: "say",
    target: "next-step",
    say: () => "Not sure what to do? This card always shows your one next move.",
  },
  {
    id: "road",
    kind: "say",
    target: "road",
    say: () => "Seven missions to become a money pro. Your jar shows where you are.",
  },
  {
    id: "spend",
    kind: "say",
    target: "spend",
    say: () => "Your Spend jar. This is money you can use right now.",
  },
  {
    id: "save",
    kind: "say",
    target: "save",
    say: () => "Your Save jar. Money you keep, growing toward something big.",
  },
  {
    id: "goal",
    kind: "say",
    target: "goal",
    say: () => "And here's your goal. Every coin you save gets you closer!",
  },
  {
    id: "diary",
    kind: "tap",
    tab: "diary",
    target: "tab-diary",
    say: () => "Tap Diary!",
    arrive: {
      target: "diary",
      speaker: "buddy",
      say: () => "Your Diary. Write down what you buy and see where your money went.",
    },
  },
  {
    id: "learn",
    kind: "tap",
    tab: "learn",
    target: "tab-learn",
    say: () => "Now tap Learn!",
    arrive: {
      target: "learn",
      speaker: "buddy",
      say: () => "Your mission road. Tap the glowing stop to play.",
    },
  },
  {
    id: "jarso",
    kind: "tap",
    tab: "jarso",
    target: "tab-jarso",
    say: () => "Tap Jarso. Someone wants to say hi!",
    arrive: {
      target: null,
      speaker: "jarso",
      say: ({ name }) => `Hi ${name}! I'm Jarso. Ask me anything about money, any time.`,
    },
  },
  {
    id: "inbox",
    kind: "tap",
    tab: "inbox",
    target: "tab-inbox",
    say: () => "Last one. Tap Notifications!",
    arrive: {
      target: "inbox",
      speaker: "buddy",
      say: () => "Your big moments and messages from your parent land here.",
    },
  },
  {
    id: "finish",
    kind: "finish",
    say: ({ name }) => `You're all set, ${name}! Watch this again any time from Me.`,
    next: "Let's go!",
  },
];

/** The buddy's name for the words, before one is picked too. */
export function buddyName(buddy: CoachId | null): string {
  return buddy ? coachNames[buddy] : "your buddy";
}

/** The tour's other words. */
export const tourCopy = {
  label: "Welcome tour",
  step: (index: number, total: number) => `${index} of ${total}`,
  next: "Next",
  skip: "Skip",
  mute: "Mute voice",
  unmute: "Turn voice on",
  pickLabel: (name: string) => `Pick ${name} as your buddy`,
  replay: "Show me around again",
  replayHint: "Your buddy walks you round the app once more.",
  jarso: "Jarso",
} as const;
