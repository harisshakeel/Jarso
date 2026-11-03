// The child's words around learning: the mission player, its inputs, the roadmap and the Learn
// pages. Both apps render them; the web output is byte-identical to what its components wrote.

type PlayerKind = "mission" | "practice" | "check-in" | "topic";

/** The mission player (missions, practice, the check-in, a topic's question). */
export const playerCopy = {
  saveFailed: "We couldn't save that. Check your connection and try again.",
  progressLabel: {
    mission: "Mission progress",
    practice: "Practice progress",
    "check-in": "Check-in progress",
    topic: "Practice progress",
  } satisfies Record<PlayerKind, string>,
  resumedHeading: "Pick up where you left off.",
  continue: "Continue",
  startQuestions: "Start the questions",
  startMission: "Start mission",
  practiceDone: "Practice done. Nicely kept fresh.",
  topicDone: {
    heading: "Nice. You've practised it.",
    body: "Opening a topic never changes your progress. Missions and practice do.",
  },
  checkInDone: {
    heading: "Thanks. That helps pick where you start.",
    body: "Mission 1 is ready for you.",
  },
  missionDone: "Mission done. Nice work.",
  saving: "Saving your answers…",
  savedOnDevice: "Saved on this device.",
  tryAgain: "Try again",
  readTopic: "Read the topic",
  replayPosition: (n: number, of: number) => `One more look: ${n} of ${of}`,
  stepPosition: (n: number, of: number) => `Step ${n} of ${of}`,
  yourTurn: "Your turn.",
  questionPosition: (n: number, of: number) => `Question ${n} of ${of}`,
  infoTitle: "Here's the idea",
  predictNote: "What do you think happens?",
  check: "Check",
  next: "Next",
  hint: "Hint",
  anotherHint: "Another hint",
  hints: "Hints",
  right: "That's it.",
  final: "Here's how it works.",
  again: "Have another go.",
  answerLine: (answer: string) => `The answer: ${answer}.`,
  readAboutTopic: "Read about this topic",
} as const;

/** The answer inputs under each question. */
export const inputCopy = {
  pickOne: "Pick one answer",
  yourAnswer: "Your answer",
  spend: "Spend",
  save: "Save",
  splitLabel: "Move the slider to choose how much goes to Save",
  /** The phone has no slider: − and + buttons move the Save part. */
  splitLabelStepper: "Tap − and + to choose how much goes to Save",
  saveLess: "Less to Save",
  saveMore: "More to Save",
  saveAmount: "Save amount",
  allSpend: "All to Spend",
  allSave: "All to Save",
  chooseMeaning: "Choose a meaning",
} as const;

/** The seven-day road on Learn. */
export const roadmapCopy = {
  heading: "Your seven-day journey",
  day: (day: number) => `Day ${day}`,
  stopName: (day: number, title: string) => `Day ${day} · ${title}`,
  locked: (name: string) => `${name}, locked`,
  tapGold: (day: number | undefined) => `Tap the gold stop to play Day ${day}.`,
  unlocksAfter: " Unlocks after the mission before it.",
  journeyDone: "Journey done. Every stop is yours to replay.",
} as const;

/** The Learn pages around the player. */
export const learnCopy = {
  heading: "Seven days. Small missions.",
  yourWeek: "Your week",
  back: "Learn",
  backToLearn: "Back to Learn",
  mission: {
    eyebrow: (day: number, topicTitle: string) => `Day ${day} · ${topicTitle}`,
    body: (summary: string) => `${summary} About three minutes. Hints are free.`,
  },
  practice: {
    caughtUpHeading: "All caught up.",
    caughtUpBody:
      "Nothing to practise right now. Skills come back here a day or more after a mission.",
    eyebrow: "Practice",
    heading: "Quick review. New examples.",
  },
  checkIn: {
    doneHeading: "Check-in done.",
    doneBody: "You only do it once. Your missions are waiting.",
    eyebrow: "Before mission 1",
    heading: "Five quick questions.",
    body: "This helps pick where you start. There's no score and nothing is locked.",
    doneLabel: "Go to your missions",
  },
  topic: {
    backTo: (title: string) => `Back to "${title}"`,
    haveAGo: "Have a go.",
    askAbout: "Ask about this",
    backToMission: "Back to your mission",
    tellMore: "Tell me more",
    enough: "That's enough",
  },
  weekQuestion: {
    nothingHeading: "Nothing to ask yet.",
    nothingBody: "A fresh question comes once you've learned a skill.",
    backToWeek: "Back to your week",
    eyebrow: "Your week",
    heading: "One fresh question.",
  },
} as const;
