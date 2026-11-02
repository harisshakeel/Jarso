/** Fixed, child-safe wording for connection states. Calm, never alarming. */
export const offlineCopy = {
  offline: "You're offline, try again when connected",
  slow: "This is taking a while. Try again?",
  waiting: "Waiting to send. We'll add it when you're back online.",
  expired: "This one waited too long. Add it again?",
  updated: "Jarso was updated. Refresh to continue.",
  /** A refused outbox item whose reply carried no message of its own. */
  refused: "Please check what you entered and try again.",
} as const;
