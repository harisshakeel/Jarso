import type { OutboxItem } from "./types";

/** An ISO time `n` minutes before the real clock, so items are due. */
export function minutesAgo(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

/** A waiting item with sensible defaults; override what a test cares about. */
export function makeItem(overrides: Partial<OutboxItem> = {}): OutboxItem {
  const id = overrides.id ?? crypto.randomUUID();
  const at = overrides.createdAt ?? new Date().toISOString();
  return {
    id,
    userId: "user-a",
    kind: "step",
    payload: { attemptId: id },
    idempotencyKey: id,
    occurredAt: at,
    createdAt: at,
    attempts: 0,
    nextAttemptAt: at,
    status: "waiting",
    ...overrides,
  };
}

/**
 * Minimal Web Locks stand-in shared by everything in one test file: exclusive locks by name,
 * with `ifAvailable` handing the callback `null` while the name is held.
 */
export function installLocks() {
  const held = new Set<string>();
  const locks = {
    async request(
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: { name: string } | null) => unknown,
    ) {
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        throw new Error("blocking requests are not supported by this stand-in");
      }
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
  Object.defineProperty(navigator, "locks", { value: locks, configurable: true });
  return () => {
    Reflect.deleteProperty(navigator, "locks");
  };
}
