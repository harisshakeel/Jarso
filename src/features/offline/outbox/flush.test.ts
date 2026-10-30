import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib";
import { flushOutbox } from "./flush";
import { open, type Store } from "./store";
import { installLocks, makeItem, minutesAgo } from "./test-utils";
import type { OutboxItem, SendOutcome } from "./types";

let store: Store;
let userId: string;
let uninstallLocks: () => void;

beforeEach(async () => {
  const opened = await open();
  if (!opened) throw new Error("fake IndexedDB should open");
  store = opened;
  userId = crypto.randomUUID();
  uninstallLocks = installLocks();
});
afterEach(() => {
  uninstallLocks();
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

describe("flush", () => {
  it("sends nothing and counts no attempt while the browser is offline", async () => {
    const [item] = await seed(1);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "retry" }));

    await flushOutbox(userId, send);

    expect(send).not.toHaveBeenCalled();
    expect(await store.listForUser(userId)).toEqual([item]);
  });

  it("stops before the next item when the browser goes offline mid-drain", async () => {
    const [first, second] = await seed(2);
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const send = vi.fn(async (_item: OutboxItem): Promise<SendOutcome> => {
      onLine.mockReturnValue(false);
      return { kind: "done", data: null };
    });

    await flushOutbox(userId, send);

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

    // A fresh module instance stands in for a second tab: it shares only the database and the
    // Web Locks, not this tab's in-memory guard.
    vi.resetModules();
    const otherTab = await import("./flush");

    const first = flushOutbox(userId, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    await otherTab.flushOutbox(userId, send);
    await flushOutbox(userId, send);
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
    await flushOutbox(userId, send);

    expect(send.mock.calls.map(([item]) => item.id)).toEqual([first.id, second.id]);
    const left = await store.listForUser(userId);
    expect(left.map((i) => i.id)).toEqual([second.id, third.id]);
    expect(left[0]).toMatchObject({ attempts: 1, status: "waiting" });
    expect(left[1]).toEqual(third);

    // The backed-off oldest item holds the queue: nothing jumps ahead of it.
    send.mockClear();
    await flushOutbox(userId, send);
    expect(send).not.toHaveBeenCalled();
  });

  it("unauthorized pauses without changing items", async () => {
    const items = await seed(2);
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "unauthorized" }));
    await flushOutbox(userId, send);
    expect(send).toHaveBeenCalledOnce();
    expect(await store.listForUser(userId)).toEqual(items);
  });

  it("skips needs_look items", async () => {
    const [stuck, next] = await seed(2);
    await store.put({ ...stuck, status: "needs_look", message: "Look." });
    const send = vi.fn(
      async (_item: OutboxItem): Promise<SendOutcome> => ({ kind: "done", data: null }),
    );
    await flushOutbox(userId, send);
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
        await flushOutbox(userId, send);
      }
      return { kind: "done", data: null };
    });
    await flushOutbox(userId, send);
    expect(sent).toEqual([first.id, late.id]);
  });

  it("swallows a store error and logs", async () => {
    await seed(1);
    vi.spyOn(store, "remove").mockRejectedValue(new DOMException("gone", "InvalidStateError"));
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "done", data: null }));
    await expect(flushOutbox(userId, send)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Outbox flush stopped", {
      userId,
      reason: "InvalidStateError",
    });
    warn.mockRestore();
    vi.mocked(store.remove).mockRestore();
  });

  it("runs unlocked when Web Locks are missing", async () => {
    uninstallLocks();
    await seed(1);
    const send = vi.fn(async (): Promise<SendOutcome> => ({ kind: "done", data: null }));
    await flushOutbox(userId, send);
    expect(send).toHaveBeenCalledOnce();
  });
});
