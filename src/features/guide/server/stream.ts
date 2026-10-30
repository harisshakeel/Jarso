import "server-only";
import { isAppError, logger } from "@/lib";
import { guideCopy } from "../copy";
import type { GuideTurnEvent } from "../types";
import { type PreparedTurn, runGuideTurn } from "./service";

/**
 * A prepared turn as an NDJSON stream (ADR 0011): one `status` line per look-up while Jarso
 * works, then the `reply`, or an `error`. Only the app's own status copy streams; the reply
 * arrives in one piece after the output screen, so nothing unscreened reaches a child.
 */
export function streamGuideTurn(turn: PreparedTurn): Response {
  const encoder = new TextEncoder();
  // The child may close the page mid-turn. The turn still finishes and is stored (so a re-send
  // gets it back); it just has no one to send lines to.
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      open = false;
    },
    async start(controller) {
      const send = (event: GuideTurnEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const data =
          turn.kind === "stored"
            ? turn.result
            : await runGuideTurn(turn, { onStatus: (text) => send({ type: "status", text }) });
        send({ type: "reply", data });
      } catch (error) {
        if (isAppError(error)) {
          send({ type: "error", error: { code: error.code, message: error.message } });
        } else {
          // Class name only: an error message can echo request content.
          logger.error("Guide turn failed", {
            error: error instanceof Error ? error.name : typeof error,
          });
          send({
            type: "error",
            error: { code: "INTERNAL", message: guideCopy.routes.unavailable },
          });
        }
      } finally {
        if (open) controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Status lines go out as they happen, not after the whole reply.
      "x-accel-buffering": "no",
    },
  });
}
