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
