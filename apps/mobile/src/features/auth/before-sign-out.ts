import { logger } from "@/lib";

type Hook = () => Promise<void>;

const hooks = new Set<Hook>();

/**
 * Work that must happen while the session still exists (drop a push token, flush a queue).
 * Returns the unregister function. Hooks run on every sign-out, asked for or not.
 */
export function registerBeforeSignOut(fn: Hook): () => void {
  hooks.add(fn);
  return () => {
    hooks.delete(fn);
  };
}

const TIMED_OUT = Symbol("timed-out");

/**
 * Runs every hook at once. A hook that throws or outlives `timeoutMs` is logged by name and
 * skipped: sign-out never waits longer than that, offline or not.
 */
export async function runBeforeSignOut(timeoutMs = 5_000): Promise<void> {
  const running = [...hooks].map(async (hook) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });
    try {
      const outcome = await Promise.race([Promise.resolve().then(hook), timeout]);
      if (outcome === TIMED_OUT) logger.warn("Before-sign-out hook timed out", { hook: hook.name });
    } catch {
      // The error itself can carry a token or an id: only the hook's name is logged.
      logger.warn("Before-sign-out hook failed", { hook: hook.name });
    } finally {
      clearTimeout(timer);
    }
  });
  await Promise.allSettled(running);
}
