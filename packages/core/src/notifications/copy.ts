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

/**
 * The phone's notification settings page: one switch per notice group, and a pause. Children's
 * wording that also reads well for parents (docs/design.md voice).
 */
export const noticeGroupCopy = {
  groups: {
    requests: {
      label: "Requests and answers",
      hint: "When someone asks for money, or gets an answer.",
    },
    money: {
      label: "Allowance and money",
      hint: "Allowance days, money coming in and changes to the jars.",
    },
    learning: { label: "Learning and Jarso", hint: "Nudges from Jarso about learning." },
    notes: { label: "Notes from family", hint: "Short notes from your family." },
  },
  pause: { label: "Pause all", hint: "No pings on this phone until you turn them back on." },
  /** The parent's footer line (their inbox). */
  inboxStillShows: "Notices still show in your inbox.",
  /** The child's footer line (their inbox is News). */
  newsStillShows: "Notices still show in News.",
  /** The phone page's title, and its row in Settings / Me. */
  title: "Notifications",
  thisPhoneOnly: "For this phone only.",
  /** A child's quiet hours: fixed, shown as information, never a switch. */
  quietHours: {
    label: "Quiet from 9pm to 7am.",
    hint: "Pings that come at night wait until morning.",
  },
  permissionOff: {
    title: "Notifications are off for Jarso on this phone.",
    body: "Turn them on in the phone's settings to get pings.",
    action: "Open phone settings",
  },
  notOn: { title: "Pings are off on this phone.", action: "Turn on" },
} as const;

/** The single push for a child's notices held overnight (count is always 2 or more). */
export const summaryPushCopy = {
  title: (count: number) => `You have ${count} new notices`,
  detail: "They came in overnight. Open News to see them.",
} as const;
