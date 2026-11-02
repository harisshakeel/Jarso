import type { OutboxItem, OutboxStore } from "@jarso/core/offline";

/** An in-memory `OutboxStore`: a `Map` listed oldest first (createdAt, then id), like the idb one. */
export function memoryStore(initial: OutboxItem[] = []): OutboxStore {
  const items = new Map(initial.map((item) => [item.id, item]));
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    async put(item) {
      items.set(item.id, item);
      changed();
    },
    async remove(id) {
      items.delete(id);
      changed();
    },
    async listForUser(userId) {
      return [...items.values()]
        .filter((item) => item.userId === userId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
