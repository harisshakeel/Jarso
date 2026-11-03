// The inbox's words around the notices themselves (those come from `noticeText`). Both apps
// render them; the web output is byte-identical to what its components wrote.
export const inboxCopy = {
  /** The child's inbox heading (the nav says "News" too). */
  childHeading: "News",
  markAll: "Mark all as read",
  showMore: "Show more",
  /** Read after an unread notice's title, for screen readers. */
  unread: " (new)",
  /** The toast's action when a notice arrives. */
  open: "Open",
} as const;

/** The phone's one-line reason before Android's notification permission prompt. */
export const pushPromptCopy = {
  title: "Get a ping from Jarso?",
  child: "We'll tell you when money arrives or a parent answers. Never late at night.",
  parent: "We'll tell you when your child asks for something or a handover is due.",
  allow: "Turn on",
  later: "Not now",
} as const;

/** The single push for a child's notices held overnight (count is always 2 or more). */
export const summaryPushCopy = {
  title: (count: number) => `You have ${count} new notices`,
  detail: "They came in overnight. Open News to see them.",
} as const;
