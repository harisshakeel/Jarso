import { guideCopy } from "./copy";
import { guideUi } from "./ui-copy";

/** The phone's Jarso tab (the chat with a face). The web keeps `guideCopy`. */
export const jarsoTabCopy = {
  heading: "Ask me anything",
  /** The short AI notice (FR09): Jarso is an AI and the parent can read the chats. */
  notice: (parent: string) =>
    `I'm an AI. ${parent.charAt(0).toUpperCase()}${parent.slice(1)} can see our chats.`,
  startersLabel: "Try asking",
  starters: [
    { key: "saving", question: guideCopy.suggestions.saving },
    { key: "spent", question: guideCopy.suggestions.spent },
    { key: "learning", question: guideCopy.suggestions.learning },
  ] as const,
  pastChats: guideUi.pastChats,
};
