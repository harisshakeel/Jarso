/** Words for the child's Learn quest map: short labels, never shaming. */
export const questCopy = {
  heading: "Learn",
  week: (n: number) => `Week ${n}`,
  count: (done: number, total: number) => `${done} / ${total}`,
  today: (day: number) => `Day ${day}!`,
  streak: (n: number) => `${n} day streak`,
  sparks: (n: number) => `${n} Sparks`,
  allDone: "All done!",
  chest: "Chest",
  chestLocked: "Finish the week",
  chestOpen: "You did it!",
  playStop: (day: number, title: string) => `Play Day ${day} · ${title}`,
  sheet: { right: "Nailed it!", wrong: "Close! Try again", shown: "Here's how" },
  checkin: { eyebrow: "Daily check-in" },
} as const;
