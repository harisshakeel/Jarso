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
};
