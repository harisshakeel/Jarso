import type { OutboxItem, OutboxStore } from "@jarso/core/offline";

/** The slice of AsyncStorage the outbox uses, so tests can hand in a map. */
export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};

const PREFIX = "jarso-outbox:";
const keyFor = (userId: string) => `${PREFIX}${userId}`;

const byAge = (a: OutboxItem, b: OutboxItem) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

function parse(raw: string | null): OutboxItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? (value as OutboxItem[]) : [];
  } catch {
    // A list that can't be read is dropped rather than blocking every later purchase.
    return [];
  }
}

/**
 * The phone's outbox on a key-value store: one key per user holding a JSON list. Writes run one
 * after another (one JS runtime), so two quick puts never overwrite each other's list.
 * `subscribe` listeners hear every change made through this store.
 */
export function createOutboxStore(storage: KeyValueStorage): OutboxStore {
  const listeners = new Set<() => void>();
  let queue: Promise<unknown> = Promise.resolve();

  /** Runs `task` after every earlier write; a failed write doesn't stop later ones. */
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  }

  function changed() {
    for (const listener of listeners) listener();
  }

  async function write(userId: string, items: OutboxItem[]) {
    if (items.length === 0) await storage.removeItem(keyFor(userId));
    else await storage.setItem(keyFor(userId), JSON.stringify(items));
  }

  return {
    put: (item) =>
      serial(async () => {
        const items = parse(await storage.getItem(keyFor(item.userId))).filter(
          (stored) => stored.id !== item.id,
        );
        await write(item.userId, [...items, item]);
        changed();
      }),
    remove: (id) =>
      serial(async () => {
        const userKeys = (await storage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
        for (const key of userKeys) {
          const items = parse(await storage.getItem(key));
          if (!items.some((item) => item.id === id)) continue;
          await write(
            key.slice(PREFIX.length),
            items.filter((item) => item.id !== id),
          );
        }
        changed();
      }),
    // Reads wait for queued writes, so a list read right after a put includes it.
    listForUser: (userId) =>
      serial(async () =>
        parse(await storage.getItem(keyFor(userId)))
          .filter((item) => item.userId === userId)
          .sort(byAge),
      ),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
