import { logger } from "@/lib";
import { reportNetworkFailure, reportNetworkSuccess } from "../use-online";
import type { OutboxItem, SendOutcome } from "./types";

const SEND_TIMEOUT_MS = 15_000;
/** Used only when a refusal carries no message of its own. */
const FALLBACK_REFUSAL = "Please check what you entered and try again.";

function body(item: OutboxItem): string {
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  return JSON.stringify({ kind: item.kind, payload: { ...payload, occurredAt: item.occurredAt } });
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
    reportNetworkFailure();
    return { kind: "retry" };
  }

  const json: unknown = await response.json().catch(() => undefined);

  if (response.ok) {
    // A 200 whose body never arrived whole: resend, the key makes it a replay.
    if (!json || typeof json !== "object") return { kind: "retry" };
    reportNetworkSuccess();
    return { kind: "done", data: (json as { data?: unknown }).data };
  }
  if (response.status >= 500) {
    logger.warn("Outbox send failed", { kind: item.kind, status: response.status });
    reportNetworkFailure();
    return { kind: "retry" };
  }
  if (response.status === 401) return { kind: "unauthorized" };

  logger.warn("Outbox item refused", { kind: item.kind, status: response.status });
  const message = (json as { error?: { message?: unknown } } | undefined)?.error?.message;
  return {
    kind: "refused",
    message: typeof message === "string" && message ? message : FALLBACK_REFUSAL,
  };
}
