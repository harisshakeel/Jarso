import { logger } from "./logger";

const UNAVAILABLE_BODY = JSON.stringify({
  code: "JA503",
  message: "Jarso is taking a while. Please try again.",
});

/**
 * Stand-in for a timed-out or unreachable upstream. A resolved 503 (not a rejection) is used
 * because postgrest-js drops the error code of a rejected fetch, and auth-js already treats
 * a 503 as a retryable fetch error. The body is what `toAppError` maps to UNAVAILABLE.
 */
function unavailableResponse(): Response {
  return new Response(UNAVAILABLE_BODY, {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

/** Statuses a Response may not carry a body with. */
const NULL_BODY = new Set([101, 204, 205, 304]);

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
 * untouched (rejects); a timeout or network failure resolves a 503 JA503 response and is
 * logged. Logs carry the call name, path (no query), status/reason and duration only.
 * The deadline covers the body too: it is read (Supabase bodies are small) and handed back as a
 * new Response with the same status and headers, so a body that stalls also times out.
 * Isomorphic.
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
      const body = NULL_BODY.has(response.status) ? null : await response.arrayBuffer();
      const durationMs = Date.now() - startedAt;
      if (durationMs > slowMs) {
        logger.warn("Slow upstream call", {
          name,
          path: pathnameOf(input),
          status: response.status,
          durationMs,
        });
      }
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      logger.warn("Upstream call failed", {
        name,
        path: pathnameOf(input),
        durationMs: Date.now() - startedAt,
        reason: deadline.signal.aborted ? "timeout" : "network",
      });
      return unavailableResponse();
    } finally {
      clearTimeout(timer);
    }
  };
}

export const supabaseFetch = createTimedFetch({ timeoutMs: 8000, name: "supabase" });
