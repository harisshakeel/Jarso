// What a parent reads about a child's learning: the card on the child page and the learning
// page. Moved word for word from the web components so the phone says the same.

export const parentLearningCopy = {
  title: "Learning",
  missionsDone: (done: number, total: number) => `${done} of ${total} missions done.`,
  notYetThisWeek: (nickname: string) => `${nickname} hasn't learned yet this week.`,
  learnedOn: (days: number) => `Learned on ${days} ${days === 1 ? "day" : "days"} this week.`,
  seeProgress: "See learning progress",
  thisWeek: "This week",
  noneThisWeek: "No learning yet this week.",
  checkIn: (correct: number) => `Starting check-in: ${correct} of 5 known already.`,
  checkInNotDone: "The starting check-in isn't done yet.",
  completedTitle: "Missions done",
  noneCompleted: "No missions finished yet.",
  skills: "Skills",
  journey: "The journey",
  journeyLabel: "The seven-day journey",
  /** A done stop: "Done on 3 Nov." with the day already formatted, or "Done." without one. */
  stopDone: (day: string | null) => `Done${day ? ` on ${day}` : ""}.`,
  stopStarted: "Started, not finished yet.",
  stopLocked: "Unlocks after the mission before it.",
} as const;
