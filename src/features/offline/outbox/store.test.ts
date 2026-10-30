import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { flush } from "./flush";
import { open } from "./store";
import { makeItem, minutesAgo } from "./test-utils";
import type { OutboxItem, SendOutcome } from "./types";

async function openStore() {
  const store = await open();
  if (!store) throw new Error("fake IndexedDB should open");
  return store;
}

describe("store", () => {
  it("lists and flushes only the current user's items", async () => {
    const store = await openStore();
    const userA = crypto.randomUUID();
    const userB = crypto.randomUUID();
    const a1 = makeItem({ userId: userA, createdAt: minutesAgo(3) });
    const b1 = makeItem({ userId: userB, createdAt: minutesAgo(2) });
    const a2 = makeItem({ userId: userA, createdAt: minutesAgo(1) });
    for (const item of [a2, b1, a1]) await store.put(item);

    expect((await store.listForUser(userA)).map((i) => i.id)).toEqual([a1.id, a2.id]);

    const send = vi.fn(
      async (_item: OutboxItem): Promise<SendOutcome> => ({ kind: "done", data: null }),
    );
    await flush(userA, send);
    expect(send.mock.calls.map(([item]) => item.id)).toEqual([a1.id, a2.id]);
    expect(await store.listForUser(userA)).toEqual([]);
    expect((await store.listForUser(userB)).map((i) => i.id)).toEqual([b1.id]);
  });

  it("notifies subscribers on put and remove", async () => {
    const store = await openStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const item = makeItem({ userId: crypto.randomUUID() });
    await store.put(item);
    await store.remove(item.id);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    await store.put(item);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
