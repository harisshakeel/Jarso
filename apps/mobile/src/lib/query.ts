import { isAppError } from "@jarso/core/lib";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

type Handler = () => void;
let onUnauthorized: Handler | undefined;

/**
 * Registers what happens when a data call says the session is no longer valid (an UNAUTHORIZED
 * AppError from `@jarso/data` or `apiFetch`). The session provider signs the child out with the
 * sign-in-again notice. Returns an unregister function.
 */
export function setUnauthorizedHandler(handler: Handler): () => void {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = undefined;
  };
}

function reportError(error: unknown) {
  if (isAppError(error) && error.code === "UNAUTHORIZED") onUnauthorized?.();
}

/** Server state for the whole app. Cleared on sign-out so no child's data outlives the session. */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportError }),
  mutationCache: new MutationCache({ onError: reportError }),
  defaultOptions: {
    // Retrying a refused session only delays the sign-out.
    queries: {
      retry: (count, error) => count < 1 && !(isAppError(error) && error.code === "UNAUTHORIZED"),
    },
  },
});

/** Query keys. Later tasks invalidate these after a mutation, so they are named in one place. */
export const keys = {
  home: (userId: string) => ["home", userId] as const,
  history: (userId: string) => ["history", userId] as const,
  requests: (userId: string) => ["requests", userId] as const,
  nickname: (userId: string) => ["nickname", userId] as const,
  rules: (userId: string) => ["rules", userId] as const,
  goal: (userId: string) => ["goal", userId] as const,
  schedule: (userId: string) => ["schedule", userId] as const,
  learning: (userId: string) => ["learning", userId] as const,
  unread: (userId: string) => ["unread", userId] as const,
  notices: (userId: string) => ["notices", userId] as const,
  guideState: (userId: string) => ["guideState", userId] as const,
  chats: (userId: string) => ["chats", userId] as const,
  /** One reopened chat. Refreshed with `chats`. */
  transcript: (userId: string, conversationId: string) =>
    ["chats", userId, conversationId] as const,
  memories: (userId: string) => ["memories", userId] as const,
  /** The jar graph's 90 days. Refreshed with `home` (it shares the prefix). */
  balance: (userId: string) => ["home", userId, "balance"] as const,
  /** This week's lines for "Where your money went". Refreshed with `history`. */
  week: (userId: string) => ["history", userId, "week"] as const,
  versions: (entryId: string) => ["versions", entryId] as const,
  /** A mission's open attempt. Refreshed with `learning` (it shares the prefix). */
  mission: (userId: string, missionKey: string) =>
    ["learning", userId, "mission", missionKey] as const,
  /** Today's practice set. Refreshed with `learning`. */
  practice: (userId: string) => ["learning", userId, "practice"] as const,
  /** The weekly review. Refreshed with `learning`. */
  review: (userId: string) => ["learning", userId, "review"] as const,

  // The parent's side. A parent's family reads share the `family` prefix; a child's pages share
  // the `child` prefix, so invalidating `family(userId)` or `child(childId)` refreshes all of them.
  /** The guide switch and which children have Jarso on (`ParentGuideState`). */
  parentGuide: (userId: string) => ["parentGuide", userId] as const,
  /** Whether the parent's profile and family are set up (the setup gate). */
  setup: (userId: string) => ["setup", userId] as const,
  /** Membership, family and children. */
  family: (userId: string) => ["family", userId] as const,
  /** The family's currency, timezone and today (the inbox's money wording). */
  familyContext: (userId: string) => ["family", userId, "context"] as const,
  dashboard: (userId: string, days: number) => ["family", userId, "dashboard", days] as const,
  /** Jarso's summary of the family's figures. */
  summary: (userId: string, days: number) => ["family", userId, "summary", days] as const,
  /** Every child's open requests ("Needs you"). */
  familyRequests: (userId: string) => ["family", userId, "requests"] as const,
  /** Every child's due allowances and gifts ("Needs you"). */
  familyDue: (userId: string) => ["family", userId, "due"] as const,
  /** The parent's own name and details (settings). */
  profile: (userId: string) => ["profile", userId] as const,
  invitations: (userId: string) => ["invitations", userId] as const,
  child: (childId: string) => ["child", childId] as const,
  childSchedule: (childId: string) => ["child", childId, "schedule"] as const,
  childDue: (childId: string) => ["child", childId, "due"] as const,
  childGifts: (childId: string) => ["child", childId, "gifts"] as const,
  childRequests: (childId: string) => ["child", childId, "requests"] as const,
  childRules: (childId: string) => ["child", childId, "rules"] as const,
  childHistory: (childId: string) => ["child", childId, "history"] as const,
  childLearning: (childId: string) => ["child", childId, "learning"] as const,
  childChats: (childId: string) => ["child", childId, "chats"] as const,
  /** One of the child's chats. Refreshed with `childChats` (it shares the prefix). */
  childTranscript: (childId: string, conversationId: string) =>
    ["child", childId, "chats", conversationId] as const,
  childMemories: (childId: string) => ["child", childId, "memories"] as const,
  childGuideAccess: (childId: string) => ["child", childId, "guideAccess"] as const,
  /** The parent's own chats with Jarso. */
  parentChats: (userId: string) => ["parentChats", userId] as const,
  /** One of the parent's chats. Refreshed with `parentChats`. */
  parentTranscript: (userId: string, conversationId: string) =>
    ["parentChats", userId, conversationId] as const,
};
