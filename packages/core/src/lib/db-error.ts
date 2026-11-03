import { AppError, type ErrorCode } from "./errors";
import { logger } from "./logger";

/** What a child or parent reads when their session has ended and they must sign in again. */
export const SIGN_IN_AGAIN = "Please sign in again.";

const mapped: Record<string, { code: ErrorCode; message: string }> = {
  JA401: { code: "UNAUTHORIZED", message: SIGN_IN_AGAIN },
  JA403: { code: "FORBIDDEN", message: "You can't do that." },
  JA404: { code: "NOT_FOUND", message: "We couldn't find that." },
  JA409: { code: "CONFLICT", message: "That already exists." },
  JA423: {
    code: "RATE_LIMITED",
    message: "Too many tries. Ask your parent or wait a little while.",
  },
  JA429: { code: "RATE_LIMITED", message: "Too many tries. Please wait a little and try again." },
  JA503: { code: "UNAVAILABLE", message: "Jarso is taking a while. Please try again." },
  "22023": { code: "VALIDATION", message: "Please check what you entered and try again." },
};

/** What a child or parent reads when the database fails for a reason we did not plan for. */
export const GENERIC_FAILURE = "Something went wrong. Please try again.";

/**
 * Maps a Postgres/PostgREST error (custom SQLSTATEs raised by our functions) to a safe AppError.
 * `context` names the call for the log ("Failed to record the purchase"); the user never reads
 * it, because "Failed to …" is developer wording (design.md §9).
 */
export function toAppError(
  error: { code?: string; message?: string } | null,
  context: string,
): AppError {
  // Own keys only: a code like "__proto__" or "constructor" must not hit Object.prototype.
  const hit = error?.code && Object.hasOwn(mapped, error.code) ? mapped[error.code] : undefined;
  if (hit) return new AppError(hit.code, hit.message, { cause: error });

  // Unexpected database/PostgREST failure: the user sees the generic line, the log keeps the cause.
  // Only code and message: Postgres DETAIL/HINT can embed key values (a future unique index on
  // an email or label would put PII in the log).
  // `dbMessage`, not `message`: the production logger spreads context over its own fields.
  logger.error("Database call failed", { context, code: error?.code, dbMessage: error?.message });
  return new AppError("INTERNAL", GENERIC_FAILURE, { cause: error });
}
