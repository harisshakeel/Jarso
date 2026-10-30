"use client";

import { useActionState } from "react";
import type { ActionResult, ActionState } from "@/lib";
import { offlineCopy } from "./copy";
import { isOnline, reportNetworkFailure, reportNetworkSuccess } from "./use-online";

const DEFAULT_TIMEOUT_MS = 15_000;

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
  if (!isOnline()) return unavailable(offlineCopy.offline);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ActionResult<never>>((resolve) => {
    timer = setTimeout(() => resolve(unavailable(offlineCopy.slow)), timeoutMs);
  });

  try {
    const result = await Promise.race([action(), timeout]);
    if (result.ok || result.error.message !== offlineCopy.slow) reportNetworkSuccess();
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
