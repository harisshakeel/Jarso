import { logger } from "@jarso/core/lib";
import type { OutboxPlatform, OutboxStore } from "./ports";
import { nextState } from "./state";
import type { OutboxItem, SendOutcome } from "./types";

export type Send = (item: OutboxItem) => Promise<SendOutcome>;

const BUSY = Symbol("busy");

/** Users whose outbox this tab is draining right now. */
const running = new Set<string>();
/** A flush asked for while this tab was already draining: run once more afterwards. */
const again = new Map<string, Send>();

/**
 * Runs `fn` as the only drainer of this user's outbox: one per tab, and one across tabs through
 * the platform's try-lock. Returns `BUSY` instead of waiting.
 */
async function exclusive<T>(
  platform: OutboxPlatform,
  userId: string,
  fn: () => Promise<T>,
): Promise<T | typeof BUSY> {
  if (running.has(userId)) return BUSY;
  running.add(userId);
  try {
    // Boxed, so a `null` from the lock (held elsewhere) can't be mistaken for `fn`'s result.
    const held = await platform.withLock(`jarso-outbox:${userId}`, async () => ({
      result: await fn(),
    }));
    return held ? held.result : BUSY;
  } finally {
    running.delete(userId);
  }
}

/**
 * Sends due waiting items oldest first, one at a time, stopping at the first retry/sign-out.
 * Offline it sends nothing, so no attempt is counted towards an item's 20.
 */
async function drain(platform: OutboxPlatform, store: OutboxStore, userId: string, send: Send) {
  const outcomes = new Map<string, SendOutcome>();
  for (const item of await store.listForUser(userId)) {
    if (platform.isOffline()) break;
    if (item.status !== "waiting") continue;
    // The oldest waiting item holds the queue while it backs off, so order is kept.
    if (Date.parse(item.nextAttemptAt) > Date.now()) break;

    let outcome: SendOutcome;
    try {
      outcome = await send(item);
    } catch {
      outcome = { kind: "retry" };
    }
    outcomes.set(item.id, outcome);

    const next = nextState(item, outcome, new Date());
    if (next === null) await store.remove(item.id);
    else if (next !== item) await store.put(next);
    if (outcome.kind === "retry" || outcome.kind === "unauthorized") break;
  }
  return outcomes;
}

/**
 * Drains the user's outbox and reports each item's outcome, or `null` when another drainer
 * holds it (or storage is unavailable). Shared by `flush` and `submit`.
 */
export async function drainOutbox(
  platform: OutboxPlatform,
  userId: string,
  send: Send,
): Promise<Map<string, SendOutcome> | null> {
  try {
    return await drainOnce(platform, userId, send);
  } catch (error) {
    // Storage went away mid-drain. Items stay where they are; the next trigger tries again.
    logger.warn("Outbox flush stopped", {
      userId,
      // Name only (a DOMException is not always an Error here); never the message.
      reason:
        typeof (error as { name?: unknown })?.name === "string" ? (error as Error).name : "unknown",
    });
    return null;
  }
}

async function drainOnce(
  platform: OutboxPlatform,
  userId: string,
  send: Send,
): Promise<Map<string, SendOutcome> | null> {
  const store = await platform.openStore();
  if (!store) return null;

  const inTab = running.has(userId);
  const result = await exclusive(platform, userId, () => drain(platform, store, userId, send));
  if (result === BUSY) {
    if (inTab) again.set(userId, send);
    return null;
  }
  for (let next = again.get(userId); next; next = again.get(userId)) {
    again.delete(userId);
    if ((await exclusive(platform, userId, () => drain(platform, store, userId, next))) === BUSY)
      break;
  }
  return result;
}

/** Sends this user's due items. A no-op while another tab is already flushing. Never throws. */
export async function flushOutbox(
  platform: OutboxPlatform,
  userId: string,
  send: Send,
): Promise<void> {
  await drainOutbox(platform, userId, send);
}
