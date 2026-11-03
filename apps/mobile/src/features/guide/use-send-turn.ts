import type { AskGuideResult, GuideContextRef } from "@jarso/core/guide";
import { sendGuideTurn } from "@jarso/core/guide";
import { isNetworkFailure, offlineCopy } from "@jarso/core/offline";
import { randomUUID } from "expo-crypto";
import { useRef } from "react";
import { env } from "@/config";
import { type ActionResult, logger, SIGN_IN_AGAIN } from "@/lib";
import { supabase } from "@/lib/supabase/client";

/** The server's turn deadline is 45 s; this leaves room for its reply or its slow notice. */
export const TURN_TIMEOUT_MS = 52_000;

type Failure = { ok: false; error: { code: "UNAVAILABLE" | "UNAUTHORIZED"; message: string } };

const unavailable = (message: string): Failure => ({
  ok: false,
  error: { code: "UNAVAILABLE", message },
});

class SignedOut extends Error {}

/** The signed-in child's or parent's bearer for /api/v1/guide/turns. Never logged. */
async function bearer(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new SignedOut("No session");
  return { authorization: `Bearer ${token}` };
}

export type TurnInput = { text: string; conversationId: string | null; context: GuideContextRef };

/**
 * Sends one question to Jarso over the streamed /api/v1/guide/turns (the web's `runOnline`
 * around `sendGuideTurn`): status lines go to `onStatus` while Jarso works, then the reply or an
 * error as an ActionResult. Sending the same text again after a failure reuses its
 * `clientMessageId`, so a reply that was saved but lost on the way back is shown, not asked
 * again. Waits 52 s at most; a dropped connection is the offline line, a timeout the slow one.
 */
export function useSendTurn({ timeoutMs = TURN_TIMEOUT_MS }: { timeoutMs?: number } = {}) {
  const unanswered = useRef<{ text: string; id: string } | null>(null);

  async function send(
    input: TurnInput,
    onStatus: (line: string) => void,
  ): Promise<ActionResult<AskGuideResult>> {
    if (unanswered.current?.text !== input.text) {
      unanswered.current = { text: input.text, id: randomUUID() };
    }
    const clientMessageId = unanswered.current.id;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    try {
      const result = await Promise.race([
        sendGuideTurn(
          {
            clientMessageId,
            conversationId: input.conversationId,
            context: input.context,
            text: input.text,
          },
          onStatus,
          {
            baseUrl: env.apiUrl.replace(/\/$/, ""),
            // The global fetch is expo/fetch on the phone: it streams the NDJSON body.
            fetch: (url, init) => fetch(url, { ...init, signal: controller.signal }),
            headers: bearer,
          },
        ),
        timedOut,
      ]);
      if (result === "timeout") {
        controller.abort();
        return unavailable(offlineCopy.slow);
      }
      if (result.ok) unanswered.current = null;
      return result;
    } catch (error) {
      if (error instanceof SignedOut) {
        return { ok: false, error: { code: "UNAUTHORIZED", message: SIGN_IN_AGAIN } };
      }
      if (isNetworkFailure(error)) return unavailable(offlineCopy.offline);
      // The server was reached (or the stream broke on this side): calm, but not "offline".
      logger.warn("Guide turn failed", { error: error instanceof Error ? error.name : "unknown" });
      return unavailable(offlineCopy.slow);
    } finally {
      clearTimeout(timer);
    }
  }

  /** A new chat: the next question gets a new id. */
  function reset() {
    unanswered.current = null;
  }

  return { send, reset };
}
