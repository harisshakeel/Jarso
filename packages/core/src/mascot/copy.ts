import type { LidColor, Wear } from "./jarso";

/** Words for customising Jarso (Me screen and onboarding). */
export const lookCopy = {
  title: "Make Jarso yours",
  lidHeading: "Lid colour",
  wearHeading: "Wear",
  lid: {
    cyan: "Sky",
    grape: "Grape",
    blush: "Blush",
    green: "Green",
    ink: "Ink",
  } satisfies Record<LidColor, string>,
  wear: {
    none: "Nothing",
    cap: "Cap",
    shades: "Shades",
    headphones: "Headphones",
    crown: "Crown",
  } satisfies Record<Wear, string>,
  lidLabel: (name: string) => `${name} lid`,
  unlocksAt: (level: number) => `Level ${level}`,
  lockedLabel: (name: string, level: number) => `${name}, unlocks at level ${level}`,
  preview: "Jarso with your look",
};
