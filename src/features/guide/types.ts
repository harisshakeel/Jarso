import type { Helpline } from "@/config";
import type { TopicKey } from "@/features/learning";

/** Where the child opened the guide (spec §5.1). */
export type GuideEntry = "step" | "why" | "topic" | "home";

/**
 * How the pipeline handled one message. The first six come from the input screen;
 * `blocked_output` means the reply failed the output screen; `unavailable` covers errors,
 * refusals, the budget and the circuit breaker.
 */
export type GuideRoute =
  | "on_topic"
  | "off_topic"
  | "personal_info"
  | "safety"
  | "unsafe"
  | "jailbreak"
  | "blocked_output"
  | "unavailable";

export type ScreenRoute = Exclude<GuideRoute, "blocked_output" | "unavailable">;

/** An optional one-question check the guide offers after explaining an idea (FR07). */
export type GuideCheck = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

export type TopicLink = { key: TopicKey; title: string };

export type GuideReply = {
  messageId: string | null;
  /** "guide" is Claude's own words; "fixed_copy" is reviewed text the app shows instead. */
  role: "guide" | "fixed_copy";
  text: string;
  route: GuideRoute;
  topics: TopicLink[];
  check: GuideCheck | null;
  helplines: Helpline[];
  /** What Jarso looked at for this reply, in plain words ("jars", "allowance"). */
  lookedAt: string[];
};

export type AskGuideResult = {
  conversationId: string;
  reply: GuideReply;
  turnsLeft: number;
};

/**
 * One line of a streamed turn (`POST /api/v1/guide/turns`, NDJSON): a status line per look-up
 * while Jarso works, then the screened reply or an error. Never any unscreened model text.
 */
export type GuideTurnEvent =
  | { type: "status"; text: string }
  | { type: "reply"; data: AskGuideResult }
  | { type: "error"; error: { code: string; message: string } };

/** What a child page needs to show the guide. */
export type GuideState = { available: boolean; introNeeded: boolean };

/** Token counts for one turn, per kind, for cost and the budgets. */
export type GuideUsage = {
  mainInput: number;
  mainOutput: number;
  mainCacheRead: number;
  mainCacheWrite: number;
  screenInput: number;
  screenOutput: number;
};

export type ConversationSummary = {
  id: string;
  entry: GuideEntry;
  label: string;
  createdAt: string;
  lastMessageAt: string;
  turns: number;
  flagged: boolean;
  /** The child's first message, or a note when it is hidden from the parent. */
  preview: string;
};

export type TranscriptMessage = {
  id: string;
  role: "child" | "guide" | "fixed_copy";
  text: string;
  route: GuideRoute | null;
  flagged: boolean;
  rating: -1 | 1 | null;
  createdAt: string;
  /** Hidden from the parent: a message that got a safety response (spec decision 3). */
  hidden: boolean;
  /** Replies only: what Jarso looked at, in plain words. */
  lookedAt: string[];
};
