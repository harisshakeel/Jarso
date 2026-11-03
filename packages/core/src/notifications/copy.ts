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
