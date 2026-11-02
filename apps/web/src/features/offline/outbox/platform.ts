import {
  flushOutbox as flushWith,
  type OutboxItem,
  type OutboxPlatform,
  type Send,
  type SendOutcome,
  type SubmitResult,
  sendToServer as sendWith,
  submitToOutbox as submitWith,
} from "@jarso/core/offline";
import { reportNetworkFailure, reportNetworkSuccess } from "../use-online";
import { open } from "./store";

/** The browser outbox: IndexedDB, Web Locks across tabs, same-origin fetch, the online banner. */
export const webOutboxPlatform: OutboxPlatform = {
  openStore: () => open(),
  isOffline: () => typeof navigator !== "undefined" && navigator.onLine === false,
  async withLock(name, fn) {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    // Without Web Locks it runs unlocked; the in-tab guard in core still holds.
    if (!locks) return fn();
    // `ifAvailable`: another tab draining means skip, never wait behind it.
    return locks.request(name, { ifAvailable: true }, (lock) => (lock ? fn() : null));
  },
  // Looked up per call and called unbound, as a browser `fetch` needs.
  fetch: (input, init) => fetch(input, init),
  baseUrl: "",
  onNetworkFailure: reportNetworkFailure,
  onNetworkSuccess: reportNetworkSuccess,
};

/** Sends this user's due items. A no-op while another tab is already flushing. Never throws. */
export function flushOutbox(userId: string, send: Send): Promise<void> {
  return flushWith(webOutboxPlatform, userId, send);
}

/** Sends one item to `POST /api/v1/outbox`. Never throws. */
export function sendToServer(item: OutboxItem): Promise<SendOutcome> {
  return sendWith(webOutboxPlatform, item);
}

/** Stores a child's action on the device, then tries to send it (see core `submitToOutbox`). */
export function submitToOutbox(input: Parameters<typeof submitWith>[1]): Promise<SubmitResult> {
  return submitWith(webOutboxPlatform, input);
}
