import { logger } from "@jarso/core/lib";
import { offlineCopy } from "../copy";
import { isNetworkFailure } from "../network";
import type { OutboxPlatform } from "./ports";
import type { OutboxItem, SendOutcome } from "./types";

const SEND_TIMEOUT_MS = 15_000;

function body(item: OutboxItem): string {
  // `userId` lets the route refuse (401) an item queued by a child who is no longer signed in.
  // The action's age, not its time: both ends of it are on the device clock, so a clock that is
  // set wrong cancels out, and the server turns the age into a time on its own clock.
  return JSON.stringify({
    kind: item.kind,
    userId: item.userId,
    ageMs: Math.max(0, Date.now() - Date.parse(item.createdAt)),
    payload: item.payload,
  });
}

/**
 * The body as JSON, or undefined when it is not JSON or the deadline passes first. Raced against
 * the signal, not only passed to fetch: a stub or an engine whose body read ignores the abort
 * would otherwise hang the queue on a body that stalls after the headers.
 */
function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(undefined);
    const onAbort = () => resolve(undefined);
    signal.addEventListener("abort", onAbort, { once: true });
    response
      .json()
      .then(resolve, () => resolve(undefined))
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** Sends one item to `POST {baseUrl}/api/v1/outbox`. Never throws. */
export async function sendToServer(
  platform: OutboxPlatform,
  item: OutboxItem,
): Promise<SendOutcome> {
  // A controller + timer rather than AbortSignal.timeout(), which Hermes does not have. The
  // deadline covers the body too, so it is cleared only once the body is read.
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), SEND_TIMEOUT_MS);
  try {
    return await send(platform, item, deadline.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function send(
  platform: OutboxPlatform,
  item: OutboxItem,
  signal: AbortSignal,
): Promise<SendOutcome> {
  // Called unbound: a browser's `fetch` throws "Illegal invocation" with a non-window `this`.
  const { fetch: post, baseUrl } = platform;
  let response: Response;
  try {
    const headers = await platform.headers?.();
    response = await post(`${baseUrl}/api/v1/outbox`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: body(item),
      signal,
    });
  } catch (error) {
    const timedOut = signal.aborted || (error instanceof Error && error.name === "TimeoutError");
    logger.warn("Outbox send failed", {
      kind: item.kind,
      reason: timedOut ? "timeout" : "network",
    });
    // A timeout is a slow link, not a lost one: only a fetch that never got out reports offline.
    if (!timedOut && isNetworkFailure(error)) platform.onNetworkFailure();
    return { kind: "retry" };
  }

  const json = await readJson(response, signal);

  if (response.ok) {
    // A 200 whose body never arrived whole: resend, the key makes it a replay.
    if (!json || typeof json !== "object") return { kind: "retry" };
    platform.onNetworkSuccess();
    return { kind: "done", data: (json as { data?: unknown }).data };
  }
  // Too many requests or a request timeout: not a refusal, try again later.
  if (response.status === 408 || response.status === 429) {
    logger.warn("Outbox send deferred", { kind: item.kind, status: response.status });
    return { kind: "retry" };
  }
  // The server answered, so this is not the device being offline.
  if (response.status >= 500) {
    logger.warn("Outbox send failed", { kind: item.kind, status: response.status });
    return { kind: "retry" };
  }
  if (response.status === 401) return { kind: "unauthorized" };

  logger.warn("Outbox item refused", { kind: item.kind, status: response.status });
  const message = (json as { error?: { message?: unknown } } | undefined)?.error?.message;
  return {
    kind: "refused",
    message: typeof message === "string" && message ? message : offlineCopy.refused,
  };
}
