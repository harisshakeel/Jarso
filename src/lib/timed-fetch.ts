import { logger } from "./logger";

/** Upstream did not answer in time, or the network failed. Maps to UNAVAILABLE via `JA503`. */
export class TimedFetchError extends Error {
  readonly code = "JA503";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TimedFetchError";
  }
}

export function isTimedFetchError(error: unknown): error is TimedFetchError {
  return error instanceof TimedFetchError;
}

function pathnameOf(input: Parameters<typeof fetch>[0]): string {
  const raw = typeof input === "string" || input instanceof URL ? input : input.url;
  try {
    return new URL(raw).pathname;
  } catch {
    return "unknown";
  }
}

/**
 * `fetch` with a hard deadline and slow-call logging. A caller abort is passed through
 * untouched; a timeout or network failure becomes a TimedFetchError. Logs carry the call
 * name, path (no query), status and duration only. Isomorphic.
 */
export function createTimedFetch(options: {
  timeoutMs: number;
  slowMs?: number;
  name: string;
}): typeof fetch {
  const { timeoutMs, name, slowMs = 1000 } = options;

  return async (input, init) => {
    // A controller + timer rather than AbortSignal.timeout(): same effect, but the timer is
    // cleared on completion and can be driven by fake timers in tests.
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, deadline.signal]) : deadline.signal;
    const startedAt = Date.now();

    try {
      const response = await fetch(input, { ...init, signal });
      const durationMs = Date.now() - startedAt;
      if (durationMs > slowMs) {
        logger.warn("Slow upstream call", {
          name,
          path: pathnameOf(input),
          status: response.status,
          durationMs,
        });
      }
      return response;
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      const reason = deadline.signal.aborted ? "timed out" : "network failure";
      throw new TimedFetchError(`${name} call ${reason}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
  };
}

export const supabaseFetch = createTimedFetch({ timeoutMs: 8000, name: "supabase" });
