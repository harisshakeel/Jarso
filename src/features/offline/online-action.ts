"use client";

import { unstable_rethrow } from "next/navigation";
import {
  type FormEvent,
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
} from "react";
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
    // A Server Action redirect reaches the client as a rejection the router turns into a
    // navigation. It is not a network failure: pass it on untouched.
    unstable_rethrow(error);
    if (error instanceof Error && error.message.includes("Failed to find Server Action")) {
      return unavailable(offlineCopy.updated);
    }
    reportNetworkFailure();
    return unavailable(offlineCopy.offline);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * An `onSubmit` handler for a form whose action is `formAction`. React 19 resets a form's
 * uncontrolled fields once a `<form action>` finishes, which would wipe what was typed after a
 * refused (offline) or slow submit. Submitting through here runs the same action without the reset.
 *
 * Pass the action's `state` so secrets still clear as before: once the server has answered (anything
 * but `UNAVAILABLE`), password and PIN inputs are emptied.
 */
export function useFormSubmit(
  formAction: (payload: FormData) => void,
  state?: ActionState<unknown>,
) {
  const form = useRef<HTMLFormElement | null>(null);
  useEffect(() => {
    if (!state || (!state.ok && state.error.code === "UNAVAILABLE")) return;
    for (const input of form.current?.querySelectorAll<HTMLInputElement>("input[type=password]") ??
      []) {
      input.value = "";
    }
  }, [state]);
  return useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      form.current = event.currentTarget;
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      const data = new FormData(event.currentTarget, submitter);
      startTransition(() => formAction(data));
    },
    [formAction],
  );
}

/**
 * `useActionState` with `runOnline` applied inside. The fourth element is the form's `onSubmit`
 * (see `useFormSubmit`): use it instead of `action={formAction}` so typed values are kept.
 */
export function useOnlineActionState<T>(
  action: (prev: ActionState<T>, payload: FormData) => Promise<ActionResult<T>>,
) {
  const [state, formAction, pending] = useActionState<ActionState<T>, FormData>(
    (prev, payload) => runOnline(() => action(prev, payload)),
    null,
  );
  const submit = useFormSubmit(formAction, state);
  return [state, formAction, pending, submit] as const;
}
