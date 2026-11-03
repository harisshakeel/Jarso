import type { TranscriptMessage } from "./types";

// What a parent reads about Jarso: the per-child switch, the chats and a transcript. Moved word
// for word from the web components so the phone says the same.

export const parentGuideCopy = {
  switchLabel: (nickname: string) => `Jarso for ${nickname}`,
  on: "On",
  off: "Off",
  /** The child page's one sentence; the link follows it. */
  shortBody: (nickname: string) =>
    `An AI helper for ${nickname}'s money questions. It sees only ${nickname}'s own jars and learning, never moves money, and you can read every chat.`,
  shortLink: "What Jarso can and can't do",
  /** The whole explanation; the link follows it. */
  fullBody: (nickname: string) =>
    `Jarso is an AI helper made with Anthropic's Claude. It answers ${nickname}'s money questions, gives hints in missions, and, when ${nickname} asks, looks at their own jars, allowance, purchases, goal, requests and learning to answer. It can't see anyone else's money or your planned gifts, and it can't move money. It never asks for personal details, never recommends products or tells them to buy anything, and points them to help if they seem unsafe. Messages, and what Jarso looks up for them, are sent to Anthropic to get answers. Chats are kept here for 30 days and you can read every one, with what Jarso looked at, except a message that needed a safety response, which isn't kept. It's on unless you turn it off, and you can turn it off or back on at any time.`,
  fullLink: "How Jarso keeps children safe",
  cardTitle: "Jarso, the AI helper",
  flagged: (count: number) =>
    count === 1 ? "1 chat is worth a look." : `${count} chats are worth a look.`,
  readChats: (nickname: string) => `Read ${nickname}'s chats`,
  noChats: "No chats yet.",
  chatsLabel: "Chats",
  worthALook: "Worth a look",
  questions: (turns: number) => `${turns} ${turns === 1 ? "question" : "questions"}`,
  chatLabel: "Chat",
  yourChild: "Your child",
  guide: "Jarso (AI)",
  fixedCopy: "Jarso (set reply)",
  lookedAt: (names: readonly string[]) => `Looked at: ${names.join(", ")}`,
  helpful: "Your child found this helpful",
  notHelpful: "Your child didn't find this helpful",
  /** Why a reply was not a normal answer, by the route it took. */
  routeNotes: {
    off_topic: "Jarso steered back to money",
    personal_info: "Personal details were not kept",
    safety: "Jarso showed the helplines",
    unsafe: "Jarso said no to this",
    jailbreak: "Jarso stayed Jarso",
    blocked_output: "Jarso's reply was held back",
    unavailable: "Jarso was not available",
  } as Partial<Record<NonNullable<TranscriptMessage["route"]>, string>>,
  /** "What Jarso remembers", as the parent reads it. */
  memoriesIntro: (nickname: string) =>
    `Short notes Jarso keeps about ${nickname} so it can pick up where they left off. You or ${nickname} can delete any.`,
} as const;

/** A chat or message time in the family's timezone, not the device's or server's. */
export function chatWhen(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}
