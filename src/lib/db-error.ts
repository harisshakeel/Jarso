import { AppError, type ErrorCode } from "./errors";
import { logger } from "./logger";

const mapped: Record<string, { code: ErrorCode; message: string }> = {
  JA401: { code: "UNAUTHORIZED", message: "Please sign in again." },
  JA403: { code: "FORBIDDEN", message: "You can't do that." },
  JA404: { code: "NOT_FOUND", message: "We couldn't find that." },
  JA409: { code: "CONFLICT", message: "That already exists." },
  JA423: {
    code: "RATE_LIMITED",
    message: "Too many tries. Ask your parent or wait a little while.",
  },
  JA429: { code: "RATE_LIMITED", message: "Too many tries. Please wait a little and try again." },
  "22023": { code: "VALIDATION", message: "Please check what you entered and try again." },
};

/** Maps a Postgres/PostgREST error (custom SQLSTATEs raised by our functions) to a safe AppError. */
export function toAppError(
  error: { code?: string; message?: string } | null,
  fallback: string,
): AppError {
  // Own keys only: a code like "__proto__" or "constructor" must not hit Object.prototype.
  const hit = error?.code && Object.hasOwn(mapped, error.code) ? mapped[error.code] : undefined;
  if (hit) return new AppError(hit.code, hit.message, { cause: error });

  // Unexpected database/PostgREST failure: the user sees `fallback`, the log keeps the cause.
  // Only code and message: Postgres DETAIL/HINT can embed key values (a future unique index on
  // an email or label would put PII in the log).
  logger.error("Database call failed", { fallback, code: error?.code, message: error?.message });
  return new AppError("INTERNAL", fallback, { cause: error });
}
