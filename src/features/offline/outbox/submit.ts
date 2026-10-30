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

/**
 * Stores a child's action on the device first, then tries to send it straight away (after any
 * older waiting items, so order is kept). `unsaved` means nothing was stored.
 */
export async function submitToOutbox(input: {
  userId: string;
  kind: OutboxKind;
  payload: unknown;
  idempotencyKey: string;
  occurredAt?: string;
}): Promise<SubmitResult> {
  const store = await open();
  if (!store) return { status: "unsaved" };

  const now = createdNow();
  const item: OutboxItem = {
    id: input.kind === "purchase" ? input.idempotencyKey : uuid(),
    userId: input.userId,
    kind: input.kind,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.occurredAt ?? now,
    createdAt: now,
    attempts: 0,
    nextAttemptAt: now,
    status: "waiting",
  };
  try {
    await store.put(item);
  } catch {
    return { status: "unsaved" };
  }

  if (typeof navigator !== "undefined" && navigator.onLine === false) return { status: "queued" };

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
