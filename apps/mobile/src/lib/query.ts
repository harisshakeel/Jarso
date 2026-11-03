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
};
