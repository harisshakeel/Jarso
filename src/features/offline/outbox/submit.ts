import { drainOutbox } from "./flush";
import { sendToServer } from "./send";
import { open } from "./store";
import type { OutboxItem, OutboxKind, SendOutcome, SubmitResult } from "./types";
import { uuid } from "./uuid";

let lastCreatedAt = 0;

/** Strictly increasing within a tab, so two quick submits keep their order. */
function createdNow(): string {
  lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1);
  return new Date(lastCreatedAt).toISOString();
}

function offline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * No storage on this device (private mode, storage blocked): online, send the one item as it
 * is, with the same key; offline there is nowhere to keep it.
 */
async function sendWithoutStore(item: OutboxItem): Promise<SubmitResult> {
  if (offline()) return { status: "unsaved" };
  const outcome = await sendToServer(item);
  if (outcome.kind === "done") return { status: "sent", data: outcome.data };
  if (outcome.kind === "refused") return { status: "refused", message: outcome.message };
  return { status: "unsent" };
}

/**
 * Stores a child's action on the device first, then tries to send it straight away (after any
 * older waiting items, so order is kept). Without storage it sends directly; `unsaved` (offline)
 * and `unsent` (the direct send didn't go through) mean nothing was kept.
 */
export async function submitToOutbox(input: {
  userId: string;
  kind: OutboxKind;
  payload: unknown;
  idempotencyKey: string;
}): Promise<SubmitResult> {
  const now = createdNow();
  const item: OutboxItem = {
    id: input.kind === "purchase" ? input.idempotencyKey : uuid(),
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    status: "waiting",
  };
  const store = await open();
  if (!store) return sendWithoutStore(item);
  try {
    await store.put(item);
  } catch {
    return sendWithoutStore(item);
  }

  if (offline()) return { status: "queued" };

  let outcome: SendOutcome | undefined;
  try {
    outcome = (await drainOutbox(input.userId, sendToServer))?.get(item.id);
  } catch {
    // The item is stored; whatever went wrong after that, it waits for the next flush.
    return { status: "queued" };
  }
  if (outcome?.kind === "done") return { status: "sent", data: outcome.data };
  if (outcome?.kind === "refused") return { status: "refused", message: outcome.message };
  return { status: "queued" };
}
