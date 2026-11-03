import type { ActionResult, ErrorCode } from "@jarso/core/lib";
import type { z } from "zod";
import { guideCopy } from "./copy";
import type { askGuideSchema } from "./schemas";
import type { AskGuideResult, GuideTurnEvent } from "./types";

/** What the browser sends for one message: exactly what the route parses. */
export type GuideTurnRequest = z.input<typeof askGuideSchema>;

type ApiError = { error?: { code?: ErrorCode; message?: string; details?: unknown } };

function fieldErrorsOf(details: unknown): Record<string, string[] | undefined> | undefined {
  if (!details || typeof details !== "object" || !("fieldErrors" in details)) return undefined;
  return details.fieldErrors as Record<string, string[] | undefined>;
}

/**
 * Sends one message to Jarso and reads the NDJSON stream (`POST /api/v1/guide/turns`): calls
 * `onStatus` for each look-up, and resolves with the reply as an ActionResult, the shape
 * `runOnline` expects. A dropped connection rejects, so `runOnline` shows the offline note.
 * The web posts to its own origin with its cookie; the phone passes its `baseUrl`, `expo/fetch`
 * and `headers()` returning its bearer.
 */
export async function sendGuideTurn(
  request: GuideTurnRequest,
  onStatus: (text: string) => void,
  opts: {
    baseUrl?: string;
    fetch?: typeof fetch;
    headers?: () => Promise<Record<string, string>>;
  } = {},
): Promise<ActionResult<AskGuideResult>> {
  const headers = await opts.headers?.();
  const response = await (opts.fetch ?? fetch)(`${opts.baseUrl ?? ""}/api/v1/guide/turns`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(request),
  });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as ApiError | null;
    return {
      ok: false,
      error: {
        code: payload?.error?.code ?? "INTERNAL",
        message: payload?.error?.message ?? guideCopy.routes.unavailable,
        fieldErrors: fieldErrorsOf(payload?.error?.details),
      },
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      const event = JSON.parse(line) as GuideTurnEvent;
      if (event.type === "status") onStatus(event.text);
      else if (event.type === "reply") return { ok: true, data: event.data };
      else {
        const code = event.error.code as ErrorCode;
        return { ok: false, error: { code, message: event.error.message } };
      }
    }
    if (done) break;
  }
  throw new Error("The reply stream ended early");
}
