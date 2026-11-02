import { logger } from "@/lib";
import { nextState } from "./state";
import { open, type Store } from "./store";
import type { OutboxItem, SendOutcome } from "./types";

export type Send = (item: OutboxItem) => Promise<SendOutcome>;

const BUSY = Symbol("busy");

/** Users whose outbox this tab is draining right now. */
const running = new Set<string>();
/** A flush asked for while this tab was already draining: run once more afterwards. */
const again = new Map<string, Send>();

/**
 * Runs `fn` as the only drainer of this user's outbox: one per tab, and one across tabs through
 * a Web Lock. Returns `BUSY` instead of waiting. Without Web Locks it runs unlocked in-tab only.
 */
async function exclusive<T>(userId: string, fn: () => Promise<T>): Promise<T | typeof BUSY> {
  if (running.has(userId)) return BUSY;
  running.add(userId);
  try {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    if (!locks) return await fn();
    return await locks.request(`jarso-outbox:${userId}`, { ifAvailable: true }, (lock) =>
      lock ? fn() : BUSY,
    );
  } finally {
    running.delete(userId);
  }
}

/** The browser knows it has no network: a send would only fail and use up an attempt. */
function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Sends due waiting items oldest first, one at a time, stopping at the first retry/sign-out.
 * Offline it sends nothing, so no attempt is counted towards an item's 20.
 */
async function drain(store: Store, userId: string, send: Send) {
  const outcomes = new Map<string, SendOutcome>();
  for (const item of await store.listForUser(userId)) {
    if (offline()) break;
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
  userId: string,
  send: Send,
): Promise<Map<string, SendOutcome> | null> {
  try {
    return await drainOnce(userId, send);
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

async function drainOnce(userId: string, send: Send): Promise<Map<string, SendOutcome> | null> {
  const store = await open();
  if (!store) return null;

  const inTab = running.has(userId);
  const result = await exclusive(userId, () => drain(store, userId, send));
  if (result === BUSY) {
    if (inTab) again.set(userId, send);
    return null;
  }
  for (let next = again.get(userId); next; next = again.get(userId)) {
    again.delete(userId);
    if ((await exclusive(userId, () => drain(store, userId, next))) === BUSY) break;
  }
  return result;
}

/** Sends this user's due items. A no-op while another tab is already flushing. Never throws. */
export async function flushOutbox(userId: string, send: Send): Promise<void> {
  await drainOutbox(userId, send);
}
