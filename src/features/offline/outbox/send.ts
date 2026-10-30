import { logger } from "@/lib";
import { offlineCopy } from "../copy";
import { isNetworkFailure, reportNetworkFailure, reportNetworkSuccess } from "../use-online";
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

/** Sends one item to `POST /api/v1/outbox`. Never throws. */
export async function sendToServer(item: OutboxItem): Promise<SendOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/v1/outbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body(item),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "TimeoutError";
    logger.warn("Outbox send failed", { kind: item.kind, reason: reason ? "timeout" : "network" });
    // A timeout is a slow link, not a lost one: only a fetch that never got out reports offline.
    if (isNetworkFailure(error)) reportNetworkFailure();
    return { kind: "retry" };
  }

  const json: unknown = await response.json().catch(() => undefined);

  if (response.ok) {
    // A 200 whose body never arrived whole: resend, the key makes it a replay.
    if (!json || typeof json !== "object") return { kind: "retry" };
    reportNetworkSuccess();
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
