import { type IDBPDatabase, openDB } from "idb";
import type { OutboxItem } from "./types";

const DB_NAME = "jarso-outbox";
const STORE = "items";
const BY_USER = "userId";
const CHANNEL = "jarso-outbox";

export type Store = {
  put(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
  /** One user's items, oldest first. Never another user's. */
  listForUser(userId: string): Promise<OutboxItem[]>;
  /** Called after any change, in this tab or another. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
};

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    if (channel) channel.onmessage = () => emit();
  }
  return channel;
}

function emit() {
  for (const listener of listeners) listener();
}

function changed() {
  emit();
  getChannel()?.postMessage(null);
}

function wrap(db: IDBPDatabase): Store {
  return {
    async put(item) {
      await db.put(STORE, item);
      changed();
    },
    async remove(id) {
      await db.delete(STORE, id);
      changed();
    },
    async listForUser(userId) {
      const items: OutboxItem[] = await db.getAllFromIndex(STORE, BY_USER, userId);
      return items.sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    },
    subscribe(listener) {
      getChannel();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let opening: Promise<Store | null> | undefined;

/** The device outbox, or `null` when IndexedDB is unavailable (private mode, blocked storage). */
export function open(): Promise<Store | null> {
  opening ??= (async () => {
    try {
      if (typeof indexedDB === "undefined" || !indexedDB) return null;
      const db = await openDB(DB_NAME, 1, {
        upgrade(database) {
          const store = database.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex(BY_USER, "userId");
        },
        blocking() {
          // A newer version is waiting in another tab: step aside and reopen next time.
          db.close();
          opening = undefined;
        },
        terminated() {
          opening = undefined;
        },
      });
      return wrap(db);
    } catch {
      return null;
    }
  })();
  const current = opening;
  // A failed open is not cached, so storage that comes back later is picked up.
  void current.then((store) => {
    if (!store && opening === current) opening = undefined;
  });
  return current;
}

/** Deletes one item (for "Remove" on an item that needs a look). */
export async function remove(id: string): Promise<void> {
  const store = await open();
  await store?.remove(id);
}
