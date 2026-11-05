// The child's welcome tour (2026-11-06, demo 3 feedback): the buddy they pick walks them round
// Home, then hops through each tab, pointing at one thing at a time like a game tutorial. The
// steps live here and their words in @jarso/content/tour, so the phone can tell the same story
// and scripts/lesson-voice.py can record it. Nothing in the tour changes money: every "tap" step
// only opens a tab. Child-facing words: short, warm, a bit excited.
import { type CoachId, coachNames } from "@jarso/core/learning";
import { tourTemplate } from "./content";

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

/** A bubble's words from the content, with the child's and the buddy's names filled in. */
function line(lineId: string): (words: Words) => string {
  const template = tourTemplate(lineId);
  return ({ name, buddy }) => template.replaceAll("{name}", name).replaceAll("{buddy}", buddy);
}

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
    say: line("pick"),
  },
  {
    id: "hello",
    kind: "say",
    target: null,
    say: line("hello"),
    next: "Let's go!",
  },
  {
    id: "streak",
    kind: "say",
    target: "streak",
    say: line("streak"),
  },
  {
    id: "next-step",
    kind: "say",
    target: "next-step",
    say: line("next-step"),
  },
  {
    id: "road",
    kind: "say",
    target: "road",
    say: line("road"),
  },
  {
    id: "spend",
    kind: "say",
    target: "spend",
    say: line("spend"),
  },
  {
    id: "save",
    kind: "say",
    target: "save",
    say: line("save"),
  },
  {
    id: "goal",
    kind: "say",
    target: "goal",
    say: line("goal"),
  },
  {
    id: "diary",
    kind: "tap",
    tab: "diary",
    target: "tab-diary",
    say: line("diary"),
    arrive: {
      target: "diary",
      speaker: "buddy",
      say: line("diary-arrive"),
    },
  },
  {
    id: "learn",
    kind: "tap",
    tab: "learn",
    target: "tab-learn",
    say: line("learn"),
    arrive: {
      target: "learn",
      speaker: "buddy",
      say: line("learn-arrive"),
    },
  },
  {
    id: "jarso",
    kind: "tap",
    tab: "jarso",
    target: "tab-jarso",
    say: line("jarso"),
    arrive: {
      target: null,
      speaker: "jarso",
      say: line("jarso-arrive"),
    },
  },
  {
    id: "inbox",
    kind: "tap",
    tab: "inbox",
    target: "tab-inbox",
    say: line("inbox"),
    arrive: {
      target: "inbox",
      speaker: "buddy",
      say: line("inbox-arrive"),
    },
  },
  {
    id: "finish",
    kind: "finish",
    say: line("finish"),
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
