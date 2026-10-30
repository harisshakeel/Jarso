"use client";

import { useActionState } from "react";
import type { ActionResult, ActionState } from "@/lib";
import { offlineCopy } from "./copy";
import { reportNetworkFailure, reportNetworkSuccess } from "./use-online";

const DEFAULT_TIMEOUT_MS = 15_000;

const TIMED_OUT = Symbol("timed out");

function unavailable(message: string): ActionResult<never> {
  return { ok: false, error: { code: "UNAVAILABLE", message } };
}

/**
 * Runs an online-only Server Action. Offline, a dropped connection or a slow reply becomes a
 * calm `UNAVAILABLE` result instead of a throw. A timed-out call is left to settle on its own.
 */
export async function runOnline<T>(
  action: () => Promise<ActionResult<T>>,
  options: { timeoutMs?: number } = {},
): Promise<ActionResult<T>> {
  // Only the browser's own signal blocks a call. A reported failure shows the banner, but the
  // next attempt still goes through, so a working call can clear it.
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return unavailable(offlineCopy.offline);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });

  try {
    const result = await Promise.race([action(), timeout]);
    if (result === TIMED_OUT) return unavailable(offlineCopy.slow);
    reportNetworkSuccess();
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Failed to find Server Action")) {
      return unavailable(offlineCopy.updated);
    }
    reportNetworkFailure();
    return unavailable(offlineCopy.offline);
  } finally {
    clearTimeout(timer);
  }
}

/** `useActionState` with `runOnline` applied inside. */
export function useOnlineActionState<T>(
  action: (prev: ActionState<T>, payload: FormData) => Promise<ActionResult<T>>,
) {
  return useActionState<ActionState<T>, FormData>(
    (prev, payload) => runOnline(() => action(prev, payload)),
    null,
  );
}
