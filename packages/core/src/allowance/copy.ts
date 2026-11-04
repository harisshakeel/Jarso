/**
 * What a parent reads when an allowance, gift or handover write is refused. Shared by the web
 * services and the phone, word for word.
 */
export const allowanceErrors = {
  alreadyExists: "There's already an allowance. Change it instead.",
  nextOn: "Pick a later date: after the last allowance, after any pause, and within a year.",
  stopped: "This allowance has stopped. Set up a new one.",
  notRunning: "This allowance isn't running, so it can't pause.",
  notPaused: "This allowance isn't paused.",
  alreadyStopped: "This allowance has already stopped.",
  giftDone: "This gift was already handed over or cancelled.",
  notGiven: "This allowance was marked as not given, so nothing was recorded.",
  giftCancelled: "This gift was cancelled, so nothing was recorded.",
  giftNotDue: "This gift isn't due yet.",
  giftDatePast: "Pick today or a later date.",
} as const;

// Parent screens. Moved word for word from the web components so the phone says the same.
// Functions take values already formatted (money, days) by the caller.

/** What a due item is called: "Gift" or "Allowance". */
export function dueKindLabel(kind: "allowance" | "gift"): string {
  return kind === "gift" ? "Gift" : "Allowance";
}

/** "Needs you" on the parent's Home: what is waiting to be handed over. */
export const needsYouCopy = {
  title: "Needs you",
  waiting: " waiting",
  allCaughtUp: "All caught up.",
  due: (day: string) => `Due ${day}`,
  handOver: "Hand over",
  handOverLabel: (kind: "allowance" | "gift", nickname: string, day: string) =>
    `Hand over ${kind} to ${nickname}, due ${day}`,
  /** How long a handover has waited, said plainly: never "overdue" or "missed". */
  late: (days: number) => (days === 1 ? "1 day ago" : `${days} days ago`),
} as const;

/** The due and coming-up lists on the child page. */
export const dueListCopy = {
  dueTitle: "Due now",
  giftsTitle: "Gifts coming up",
  gift: "Gift",
  due: (day: string) => `Due ${day}`,
  on: (day: string) => `On ${day}`,
  handOver: "Hand over",
  edit: "Edit",
  giveGift: "Give a gift",
} as const;

/** Handing over an allowance or a gift, and marking an allowance as not given. */
export const handoverCopy = {
  moneyError: "Enter an amount like 5 or 5.50.",
  handedOver: (nickname: string) => `Handed over to ${nickname}.`,
  alreadyHandled: "Already handled.",
  heading: (kind: "allowance" | "gift", day: string) => `${dueKindLabel(kind)} · Due ${day}`,
  over: (due: string) => `That's more than ${due}, which was due.`,
  saveShareLabel: (amount: string) => `Save share of ${amount}`,
  cashLabel: (nickname: string) => `Spend (cash to ${nickname})`,
  savedLabel: "Save (you keep)",
  hintPrevious: "Same split as last time. Drag or type to change.",
  hint: "Drag or type to change.",
  /** The short line, in pieces so the amounts can be styled: "{nickname} gets {x} this time, {y} less than was due." */
  short: { gets: "gets", thisTime: "this time,", less: "less than was due." },
  shortLine: (nickname: string, gets: string, less: string) =>
    `${nickname} gets ${gets} this time, ${less} less than was due.`,
  gaveLess: "Gave less? Enter what you gave.",
  confirm: "Confirm I handed it over",
  back: "Back",
  notGiven: "Mark as not given",
  notGivenTitle: "Mark as not given?",
  notGivenBody: (nickname: string) => `${nickname} won't get this one, and it won't be paid later.`,
  goBack: "Go back",
  markedNotGiven: "Marked as not given.",
  changeGift: "Change or cancel this gift",
} as const;

/** A one-time gift: set up, change or cancel. */
export const giftCopy = {
  saved: "Gift saved",
  amount: "Amount",
  giveOn: "Give on",
  noteLabel: (nickname: string) => `Note for ${nickname} (optional)`,
  back: "Back",
  save: "Save gift",
  cancelled: "Gift cancelled",
  cancelTrigger: "Cancel this gift",
  cancelTitle: "Cancel this gift?",
  cancelBody: (nickname: string) => `${nickname} won't see it.`,
  keep: "Keep it",
  cancel: "Cancel gift",
} as const;

/** Setting up or changing an allowance. */
export const allowanceFormCopy = {
  saved: "Allowance saved",
  amount: "Amount",
  frequencyLabels: {
    weekly: "Weekly",
    monthly: "Monthly",
    quarterly: "Every 3 months",
    annual: "Yearly",
  },
  oneTime: "One time",
  howOften: "How often",
  nextOn: "Next one on",
  firstOn: "First one on",
  pausedUntil: (day: string) => `Paused until ${day}, so pick a date after that.`,
  cancel: "Cancel",
  save: "Save allowance",
} as const;

/** The allowance card on the child page and the manage page's summary. */
export const allowanceSummaryCopy = {
  title: "Allowance",
  manage: "Manage",
  setUp: "Set up allowance",
  paused: "Paused",
  next: (day: string) => `Next: ${day}`,
  change: "Change",
  pausedUntil: (day: string, nextDay: string | null) =>
    `Paused until ${day}.${nextDay ? ` Next one: ${nextDay}.` : ""}`,
  pausedOpen: "Paused until a parent resumes it.",
  resumed: "Allowance resumed",
  resume: "Resume",
  stopped: "Allowance stopped",
  stop: "Stop allowance",
  stopTitle: (nickname: string) => `Stop ${nickname}'s allowance?`,
  stopBody: "Anything already due stays due.",
  keep: "Keep it",
} as const;

/** Pausing an allowance. */
export const pauseCopy = {
  pause: "Pause",
  title: (nickname: string) => `Pause ${nickname}'s allowance`,
  body: "No allowance falls due while paused. Missed allowances aren't paid later. Anything already due stays due.",
  untilOptions: [
    { value: "date", label: "A date" },
    { value: "resume", label: "I resume it" },
  ],
  until: "Until",
  pauseUntil: "Pause until",
  messageLabel: (nickname: string) => `Message for ${nickname} (optional)`,
  paused: "Allowance paused",
  cancel: "Cancel",
} as const;
