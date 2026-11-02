import type { OutboxItem } from "./types";

/** Where a device keeps its outbox. Web: IndexedDB; tests: an in-memory map. */
export interface OutboxStore {
  put(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
  /** One user's items, oldest first (`createdAt`, then `id`). Never another user's. */
  listForUser(userId: string): Promise<OutboxItem[]>;
  /** Called after any change, from this context or another. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** What the outbox needs from the device it runs on. */
export interface OutboxPlatform {
  /** The device outbox, or `null` when storage is unavailable (private mode, blocked storage). */
  openStore(): Promise<OutboxStore | null>;
  /** The device knows it has no network: a send would only fail and use up an attempt. */
  isOffline(): boolean;
  /**
   * A try-lock shared by every context that drains this outbox (web: tabs, via Web Locks with
   * `ifAvailable`). Runs `fn` only if `name` is free and resolves with its result; while `name`
   * is held elsewhere it resolves `null` at once, without calling `fn`. Never waits for the lock.
   */
  withLock<T>(name: string, fn: () => Promise<T>): Promise<T | null>;
  fetch: typeof fetch;
  /** Prefix for `/api/v1/outbox`: `""` on web (same origin), the API origin elsewhere. */
  baseUrl: string;
  /** Extra request headers, e.g. a bearer token. */
  headers?(): Promise<Record<string, string>>;
  /** A send never reached the server (not a timeout). */
  onNetworkFailure(): void;
  /** A send got through and the server took it. */
  onNetworkSuccess(): void;
}
