import {
  flushOutbox,
  type OutboxItem,
  type OutboxKind,
  type OutboxPlatform,
  type OutboxStore,
  type SendOutcome,
  type SubmitResult,
  sendToServer,
  submitToOutbox,
} from "@jarso/core/offline";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { env } from "@/config";
import { supabase } from "../supabase/client";
import { createOutboxStore } from "./store";

type Listener = () => void;

// --- Connection state: what expo-network last said, corrected by each send's result. ---

/** null until expo-network or a send has said anything: unknown counts as online. */
let online: boolean | null = null;
const onlineListeners = new Set<Listener>();

/** Sets the phone's connection state; tells listeners only when it changes. */
export function setOnline(next: boolean): void {
  if (online === next) return;
  online = next;
  for (const listener of onlineListeners) listener();
}

export function isOnline(): boolean {
  return online !== false;
}

export function subscribeOnline(listener: Listener): () => void {
  onlineListeners.add(listener);
  return () => {
    onlineListeners.delete(listener);
  };
}

// --- A stored item reached the server through a flush or a resend: its screens refresh. ---

type SentListener = (kind: OutboxKind) => void;
const sentListeners = new Set<SentListener>();

/** Runs `listener` with the item's kind each time a stored item is taken by the server. */
export function onItemSent(listener: SentListener): () => void {
  sentListeners.add(listener);
  return () => {
    sentListeners.delete(listener);
  };
}

// --- The platform core's outbox runs on. ---

let store: OutboxStore | undefined;
/** One try-lock per name; the phone has one JS runtime, so a Set is the whole lock. */
const held = new Set<string>();

/**
 * The phone outbox: AsyncStorage (one key per user), an in-process try-lock, expo-network's
 * state, the global fetch to the web's /api/v1 with the child's bearer token.
 */
export const outboxPlatform: OutboxPlatform = {
  async openStore() {
    store ??= createOutboxStore(AsyncStorage);
    return store;
  },
  isOffline: () => online === false,
  async withLock(name, fn) {
    // Never waits: a second drainer while one runs gets null at once.
    if (held.has(name)) return null;
    held.add(name);
    try {
      return await fn();
    } finally {
      held.delete(name);
    }
  },
  // Looked up per call, so a test's or a polyfill's fetch is the one used.
  fetch: (input, init) => fetch(input, init),
  baseUrl: env.apiUrl.replace(/\/$/, ""),
  async headers(): Promise<Record<string, string>> {
    // getSession refreshes an expired access token first. No session: the server says 401 and
    // the item waits, untouched, until the child is signed in again.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { authorization: `Bearer ${token}` } : {};
  },
  onNetworkFailure: () => setOnline(false),
  onNetworkSuccess: () => setOnline(true),
};

/** Sends one stored item; tells `onItemSent` listeners when it got through. */
export async function sendItem(item: OutboxItem): Promise<SendOutcome> {
  const outcome = await sendToServer(outboxPlatform, item);
  if (outcome.kind === "done") {
    for (const listener of sentListeners) listener(item.kind);
  }
  return outcome;
}

/** Sends this user's due items. A no-op while another flush runs. Never throws. */
export function flush(userId: string): Promise<void> {
  return flushOutbox(outboxPlatform, userId, sendItem);
}

/** Stores a child's action on the phone, then tries to send it (core `submitToOutbox`). */
export function submit(input: {
  userId: string;
  kind: OutboxKind;
  payload: unknown;
  idempotencyKey: string;
}): Promise<SubmitResult> {
  return submitToOutbox(outboxPlatform, input);
}

/** Deletes one item ("Remove" on a purchase that needs a look, or a refusal the child saw). */
export async function removeItem(id: string): Promise<void> {
  const opened = await outboxPlatform.openStore();
  await opened?.remove(id);
}
