import { logger } from "@/lib";
import { offlineCopy } from "../copy";
import type { OutboxItem, SendOutcome } from "./types";

/** Wait before attempt n+1 after n failed attempts, then `BACKOFF_CAP_MS` from there on. */
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000];
const BACKOFF_CAP_MS = 60_000;
export const MAX_ATTEMPTS = 20;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** What a stored item becomes after one send. `null` means delete it. Pure apart from a log. */
export function nextState(item: OutboxItem, outcome: SendOutcome, now: Date): OutboxItem | null {
  switch (outcome.kind) {
    case "done":
      return null;
    case "refused":
      // Only purchases have a "needs a look" screen. A refused learning result is dropped, or
      // it would sit on the device forever; the player shows the refusal if the child is there.
      if (item.kind !== "purchase") {
        logger.warn("Refused outbox item dropped", { kind: item.kind });
        return null;
      }
      return { ...item, status: "needs_look", message: outcome.message };
    case "unauthorized":
      // Signed out, not rejected: keep the item exactly as it is until the user is back.
      return item;
    case "retry": {
      const attempts = item.attempts + 1;
      const tooOld = now.getTime() - Date.parse(item.occurredAt) > MAX_AGE_MS;
      if (attempts >= MAX_ATTEMPTS || tooOld) {
        return { ...item, attempts, status: "needs_look", message: offlineCopy.expired };
      }
      const delay = BACKOFF_MS[attempts - 1] ?? BACKOFF_CAP_MS;
      return {
        ...item,
        attempts,
        status: "waiting",
        nextAttemptAt: new Date(now.getTime() + delay).toISOString(),
      };
    }
  }
}

/**
 * Whether to tell the child an item is still on the device. Every item is stored as waiting just
 * before its first send, so a waiting one only counts once a send has failed or while offline.
 */
export function showsAsPending(item: OutboxItem, online: boolean): boolean {
  return item.status === "needs_look" || item.attempts > 0 || !online;
}
