import type { Jar } from "./types";

/** "Where your money went" (the week's card). */
export const whereItWentCopy = {
  heading: "Where your money went",
} as const;

/** The jars graph on child Home ("Your money ride"). */
export const graphCopy = {
  title: "Your money ride",
  /** The period picker's group name. */
  show: "Show",
  tracks: "Tracks",
  spend: "Spend",
  save: "Save",
  seeNumbers: "See the numbers",
  day: "Day",
} as const;

/** The phone's jar pages (Spend and Save). */
export const jarPageCopy = {
  title: { spend: "Spend jar", save: "Save jar" },
  barsHeading: { spend: "Each week", save: "Saved each week" },
  bestWeek: "Best week!",
  caption: {
    spend: "Cash you have",
    /** "Mum keeps it safe"; `parent` is the parent label, first letter capitalised here. */
    save: (parent: string) => `${parent.charAt(0).toUpperCase()}${parent.slice(1)} keeps it safe`,
  },
  actions: {
    spend: [
      { label: "I bought something", hint: "From Spend", href: "/(child)/purchase" },
      { label: "I got money", hint: "Gift, pay, found", href: "/(child)/received" },
    ],
    save: (parent: string) =>
      [
        { label: "Save some", hint: `Give cash to ${parent}`, href: "/(child)/put-in" },
        { label: "Use savings", hint: `Ask ${parent} for it`, href: "/(child)/take-out" },
      ] as const,
  },
  /** Screen-reader summary of the six bars; `totals` is already a spoken list. */
  barsLabel: (jar: Jar, totals: string) =>
    `${jar === "save" ? "Save" : "Spend"} jar, last 6 weeks: ${totals}`,
} as const;
