// "Send a note": a short note from a parent to a child's Notifications. Moved word for word from the web
// component so the phone says the same.

export const noteCopy = {
  trigger: "Send a note",
  triggerTo: (nickname: string) => `to ${nickname}`,
  title: (nickname: string) => `A note for ${nickname}`,
  body: (nickname: string) => `It shows in ${nickname}'s Notifications. Keep it short and kind.`,
  sent: (nickname: string) => `Note sent to ${nickname}`,
  ideas: "Ideas to start from",
  label: "Your note",
  count: (length: number, max: number) => `${length} of ${max} characters`,
  send: (nickname: string) => `Send to ${nickname}`,
} as const;
