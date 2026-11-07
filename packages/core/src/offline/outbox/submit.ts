import { drainOutbox } from "./flush";
import type { OutboxPlatform } from "./ports";
import { sendToServer } from "./send";
import type { OutboxItem, OutboxKind, SendOutcome, SubmitResult } from "./types";
import { uuid } from "./uuid";

let lastCreatedAt = 0;

/** Strictly increasing within a tab, so two quick submits keep their order. */
function createdNow(): string {
  lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1);
  return new Date(lastCreatedAt).toISOString();
}

/**
 * No storage on this device (private mode, storage blocked): online, send the one item as it
 * is, with the same key; offline there is nowhere to keep it.
 */
async function sendWithoutStore(platform: OutboxPlatform, item: OutboxItem): Promise<SubmitResult> {
  if (platform.isOffline()) return { status: "unsaved" };
  const outcome = await sendToServer(platform, item);
  if (outcome.kind === "done") return { status: "sent", data: outcome.data };
  if (outcome.kind === "refused") return { status: "refused", message: outcome.message };
  return { status: "unsent" };
}

/**
 * Stores a child's action on the device first, then tries to send it straight away (after any
 * older waiting items, so order is kept). Without storage it sends directly; `unsaved` (offline)
 * and `unsent` (the direct send didn't go through) mean nothing was kept.
 */
export async function submitToOutbox(
  platform: OutboxPlatform,
  input: {
    userId: string;
    kind: OutboxKind;
    payload: unknown;
    idempotencyKey: string;
  },
): Promise<SubmitResult> {
  const now = createdNow();
  const item: OutboxItem = {
    id: input.kind === "purchase" ? input.idempotencyKey : uuid(),
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    attempts: 0,
    // The real clock, not `now`: `createdNow` can run a few ms ahead of it, and the drain
    // would then skip this item as not yet due.
    nextAttemptAt: new Date(Date.now()).toISOString(),
    status: "waiting",
  };
  // A store that fails to open counts as none (web's `open()` already resolves `null` then).
  const store = await platform.openStore().catch(() => null);
  if (!store) return sendWithoutStore(platform, item);
  try {
    await store.put(item);
  } catch {
    return sendWithoutStore(platform, item);
  }

  if (platform.isOffline()) return { status: "queued" };

  let outcome: SendOutcome | undefined;
  try {
    outcome = (
      await drainOutbox(platform, input.userId, (queued) => sendToServer(platform, queued))
    )?.get(item.id);
  } catch {
    // The item is stored; whatever went wrong after that, it waits for the next flush.
    return { status: "queued" };
  }
  if (outcome?.kind === "done") return { status: "sent", data: outcome.data };
  if (outcome?.kind === "refused") return { status: "refused", message: outcome.message };
  return { status: "queued" };
}
