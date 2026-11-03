import type { ConversationSummary } from "./types";

// The words around a chat with Jarso (the thread, a reply, the step sheet, the chat list). The
// fixed replies are in `guideCopy`. Both apps render these; the web output is byte-identical.
export const guideUi = {
  beforeWeStart: "Before we start",
  lookedAt: (list: string) => `Looked at: ${list}`,
  helplines: "People you can talk to",
  topics: "Topics",
  helpfulLegend: "Was this helpful?",
  helpful: "Helpful",
  notHelpful: "Not helpful",
  quickCheck: (question: string) => `Quick check: ${question}`,
  checkRight: "That's it. ",
  checkWrong: "Not quite. ",
  questionLabel: "Your question for Jarso",
  sheetQuestionLabel: "Your question",
  count: (length: number, max: number) => `${length}/${max}`,
  turnsLeft: (left: number) => ` · ${left} left in this chat`,
  newChat: "New chat",
  ask: "Ask",
  send: "Send",
  open: "Open",
  you: "You: ",
  pastChats: "Past chats",
  noChats: "No chats yet.",
  chatLabel: "Chat with Jarso",
  sheetChatLabel: "Chat",
  tryThese: "Questions to try",
  backToHome: "Back to Home",
  helpMe: "Help me",
  why: "Why?",
} as const;

/** "Mon 2 Nov" in the family's timezone, not the device's or the server's. */
export function chatDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** The first message, shortened, as the chat's title; a stored chat always has one. */
export function chatTitle(chat: Pick<ConversationSummary, "preview" | "label">): string {
  const text = chat.preview.trim();
  if (!text) return chat.label;
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}
