import { helplinesFor } from "@jarso/core/config";
import { proposalFromStored } from "./proposal";
import type { GuideReply, TranscriptMessage } from "./types";

/** One line of a chat as the thread shows it: the asker's words, or one of Jarso's replies. */
export type ThreadMessage =
  | { id: string; from: "child"; text: string }
  | { id: string; from: "guide"; reply: GuideReply };

/**
 * A stored chat as thread messages, to pick it up again. Topic chips, the quick check and
 * what Jarso remembered are not stored, so a reopened reply shows its words, what it looked
 * at, the helplines on a safety reply, the thumbs given and a goal it offered (its card works
 * again: the app checks the child's current goal when they tap it).
 */
export function threadMessagesFrom(
  messages: readonly TranscriptMessage[],
  currency: string,
  /** On a parent's page: the child the chat is about, named on a reopened action card. */
  childName?: string | null,
): ThreadMessage[] {
  return messages.map((message) =>
    message.role === "child"
      ? { id: message.id, from: "child", text: message.text }
      : {
          id: message.id,
          from: "guide",
          reply: {
            messageId: message.role === "guide" ? message.id : null,
            rating: message.rating,
            role: message.role,
            text: message.text,
            route: message.route ?? "on_topic",
            topics: [],
            check: null,
            helplines: message.route === "safety" ? helplinesFor(currency) : [],
            lookedAt: message.lookedAt,
            remembered: [],
            // Only a reply that was shown carries its card; a held-back one never offered it.
            proposal:
              message.role === "guide" && message.route === "on_topic"
                ? proposalFromStored(message.proposed, currency, childName)
                : null,
          },
        },
  );
}
