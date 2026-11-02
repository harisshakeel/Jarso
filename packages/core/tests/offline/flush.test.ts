import { logger } from "@jarso/core/lib";
import type { OutboxItem, OutboxPlatform, OutboxStore, SendOutcome } from "@jarso/core/offline";
import { flushOutbox } from "@jarso/core/offline";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStore } from "./memory-store";
import { makeItem, makePlatform, minutesAgo, storeOf } from "./test-utils";

let platform: OutboxPlatform;
let store: OutboxStore;
let userId: string;

beforeEach(async () => {
  platform = makePlatform();
  store = await storeOf(platform);
  userId = crypto.randomUUID();
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Three = [OutboxItem, OutboxItem, OutboxItem];

async function seed(count: number): Promise<Three> {
  const items: OutboxItem[] = [];
  for (let i = 0; i < count; i++) {
    const item = makeItem({ userId, createdAt: minutesAgo(10 - i) });
    await store.put(item);
    items.push(item);
  }
  // Callers destructure only as many items as they seeded.
  return items as Three;
}

const done = async (_item: OutboxItem): Promise<SendOutcome> => ({ kind: "done", data: null });

describe("flush", () => {
  it("sends nothing and counts no attempt while the browser is offline", async () => {
    const [item] = await seed(1);
    platform.isOffline = () => true;
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "retry" }));

    await flushOutbox(platform, userId, send);

    expect(send).not.toHaveBeenCalled();
    expect(await store.listForUser(userId)).toEqual([item]);
  });

  it("stops before the next item when the browser goes offline mid-drain", async () => {
    const [first, second] = await seed(2);
    let offline = false;
    platform.isOffline = () => offline;
    const send = vi.fn(async (_item: OutboxItem): Promise<SendOutcome> => {
      offline = true;
      return { kind: "done", data: null };
    });

    await flushOutbox(platform, userId, send);

    expect(send.mock.calls.map(([sent]) => sent.id)).toEqual([first.id]);
    expect(await store.listForUser(userId)).toEqual([second]);
  });

  it("two flushers never send the same item concurrently", async () => {
    const items = await seed(3);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = vi.fn(async (_item: OutboxItem): Promise<SendOutcome> => {
      await gate;
      return { kind: "done", data: null };
    });

    // A fresh module instance stands in for a second tab: it shares only the store and the
    // platform's lock, not this tab's in-memory guard.
    vi.resetModules();
    const otherTab = await import("@jarso/core/offline");

    const first = flushOutbox(platform, userId, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await otherTab.flushOutbox(platform, userId, send);
    await flushOutbox(platform, userId, send);
    release();
    await first;

    expect(send.mock.calls.map(([item]) => item.id)).toEqual(items.map((i) => i.id));
    expect(await store.listForUser(userId)).toEqual([]);
  });

  it("stops at first retry and keeps order", async () => {
    const [first, second, third] = await seed(3);
    const send = vi.fn(
      async (item: OutboxItem): Promise<SendOutcome> =>
        item.id === second.id ? { kind: "retry" } : { kind: "done", data: null },
    );
    await flushOutbox(platform, userId, send);

    expect(send.mock.calls.map(([item]) => item.id)).toEqual([first.id, second.id]);
    const left = await store.listForUser(userId);
    expect(left.map((i) => i.id)).toEqual([second.id, third.id]);
    expect(left[0]).toMatchObject({ attempts: 1, status: "waiting" });
    expect(left[1]).toEqual(third);

    // The backed-off oldest item holds the queue: nothing jumps ahead of it.
    send.mockClear();
    await flushOutbox(platform, userId, send);
    expect(send).not.toHaveBeenCalled();
  });

  it("unauthorized pauses without changing items", async () => {
    const items = await seed(2);
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "unauthorized" }));
    await flushOutbox(platform, userId, send);
    expect(send).toHaveBeenCalledOnce();
    expect(await store.listForUser(userId)).toEqual(items);
  });

  it("skips needs_look items", async () => {
    const [stuck, next] = await seed(2);
    await store.put({ ...stuck, status: "needs_look", message: "Look." });
    const send = vi.fn(done);
    await flushOutbox(platform, userId, send);
    expect(send.mock.calls.map(([item]) => item.id)).toEqual([next.id]);
  });

  it("a flushOutbox asked for mid-flushOutbox in this tab runs once more afterwards", async () => {
    const [first] = await seed(1);
    const late = makeItem({ userId, createdAt: minutesAgo(1) });
    const sent: string[] = [];
    const send = vi.fn(async (item: OutboxItem): Promise<SendOutcome> => {
      sent.push(item.id);
      if (item.id === first.id) {
        await store.put(late);
        await flushOutbox(platform, userId, send);
      }
      return { kind: "done", data: null };
    });
    await flushOutbox(platform, userId, send);
    expect(sent).toEqual([first.id, late.id]);
  });

  it("swallows a store error and logs", async () => {
    await seed(1);
    vi.spyOn(store, "remove").mockRejectedValue(new DOMException("gone", "InvalidStateError"));
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "done", data: null }));
    await expect(flushOutbox(platform, userId, send)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Outbox flush stopped", {
      userId,
      reason: "InvalidStateError",
    });
    warn.mockRestore();
    vi.mocked(store.remove).mockRestore();
  });

  it("runs unlocked when Web Locks are missing", async () => {
    // Web's platform without `navigator.locks`: `withLock` just runs `fn`.
    platform.withLock = (_name, fn) => fn();
    await seed(1);
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "done", data: null }));
    await flushOutbox(platform, userId, send);
    expect(send).toHaveBeenCalledOnce();
  });

  it("flushes an item stored by the previous build", async () => {
    // Exactly what the previous web build wrote to IndexedDB: do not "update" this literal.
    const stored: OutboxItem = {
      id: "5d0c5b1e-7f8a-4c2b-9a51-1f2e3d4c5b6a",
      userId: "8b7a6c5d-4e3f-4a2b-8c1d-0e9f8a7b6c5d",
      kind: "purchase",
      payload: {
        amount: "2.50",
        label: "Comic",
        idempotencyKey: "5d0c5b1e-7f8a-4c2b-9a51-1f2e3d4c5b6a",
      },
      idempotencyKey: "5d0c5b1e-7f8a-4c2b-9a51-1f2e3d4c5b6a",
      createdAt: "2026-10-30T09:00:00.000Z",
      attempts: 0,
      nextAttemptAt: "2026-10-30T09:00:00.000Z",
      status: "waiting",
    };
    const previous = memoryStore([stored]);
    const send = vi.fn(done);

    await flushOutbox(makePlatform({ openStore: async () => previous }), stored.userId, send);

    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(stored);
    expect(await previous.listForUser(stored.userId)).toEqual([]);
  });

  it("sends each item once when two flushes overlap", async () => {
    await seed(3);
    const send = vi.fn(done);

    await Promise.all([flushOutbox(platform, userId, send), flushOutbox(platform, userId, send)]);

    expect(send).toHaveBeenCalledTimes(3);
    expect(await store.listForUser(userId)).toEqual([]);
  });
});
