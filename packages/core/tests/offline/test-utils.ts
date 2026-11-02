import type { OutboxItem, OutboxPlatform } from "@jarso/core/offline";
import { vi } from "vitest";
import { memoryStore } from "./memory-store";

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
    createdAt: at,
    attempts: 0,
    nextAttemptAt: at,
    status: "waiting",
    ...overrides,
  };
}

/**
 * An in-process try-lock, like Web Locks with `ifAvailable`: exclusive by name, and a second
 * acquire while the name is held resolves `null` without running `fn`.
 */
export function tryMutex(): OutboxPlatform["withLock"] {
  const held = new Set<string>();
  return async (name, fn) => {
    if (held.has(name)) return null;
    held.add(name);
    try {
      return await fn();
    } finally {
      held.delete(name);
    }
  };
}

/** A platform over an in-memory store, online, with a try-lock; override what a test cares about. */
export function makePlatform(overrides: Partial<OutboxPlatform> = {}): OutboxPlatform {
  const store = memoryStore();
  return {
    openStore: async () => store,
    isOffline: () => false,
    withLock: tryMutex(),
    fetch: vi.fn<typeof fetch>(),
    baseUrl: "",
    onNetworkFailure: vi.fn(),
    onNetworkSuccess: vi.fn(),
    ...overrides,
  };
}

/** The store a platform opens; fails the test if it has none. */
export async function storeOf(platform: OutboxPlatform) {
  const store = await platform.openStore();
  if (!store) throw new Error("the test platform should have a store");
  return store;
}
