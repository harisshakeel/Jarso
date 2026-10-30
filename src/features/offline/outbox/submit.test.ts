import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { open } from "./store";
import { submitToOutbox } from "./submit";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function input(userId: string) {
  const idempotencyKey = crypto.randomUUID();
  return {
    userId,
    kind: "purchase" as const,
    payload: { amount: "2.00", label: "Comic", idempotencyKey },
    idempotencyKey,
  };
}

function respond(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

describe("submit", () => {
  it("stores before sending so a crash mid-send keeps the item", async () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const userId = crypto.randomUUID();
    const data = input(userId);

    void submitToOutbox(data);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const store = await open();
    const items = (await store?.listForUser(userId)) ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: data.idempotencyKey,
      idempotencyKey: data.idempotencyKey,
      kind: "purchase",
      status: "waiting",
      attempts: 0,
    });
  });

  it("returns sent and clears the item when the server takes it", async () => {
    respond(200, { data: { id: "entry-1" } });
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(input(userId))).toEqual({
      status: "sent",
      data: { id: "entry-1" },
    });
    expect(await (await open())?.listForUser(userId)).toEqual([]);
  });

  it("returns queued and keeps the item when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(input(userId))).toEqual({ status: "queued" });
    const items = (await (await open())?.listForUser(userId)) ?? [];
    expect(items[0]).toMatchObject({ status: "waiting", attempts: 1 });
  });

  it("returns queued without sending when the browser is offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(input(userId))).toEqual({ status: "queued" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await (await open())?.listForUser(userId)).toHaveLength(1);
  });

  it("returns refused with the server message", async () => {
    respond(409, { error: { code: "CONFLICT", message: "Not enough in Spend." } });
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(input(userId))).toEqual({
      status: "refused",
      message: "Not enough in Spend.",
    });
    const items = (await (await open())?.listForUser(userId)) ?? [];
    expect(items[0]).toMatchObject({ status: "needs_look", message: "Not enough in Spend." });
  });

  it("uses a fresh uuid as the id for non-purchase kinds and keeps the key", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const userId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    await submitToOutbox({ userId, kind: "step", payload: { attemptId: "a" }, idempotencyKey });
    const [item] = (await (await open())?.listForUser(userId)) ?? [];
    expect(item?.idempotencyKey).toBe(idempotencyKey);
    expect(item?.id).not.toBe(idempotencyKey);
  });

  it("sends older waiting items first", async () => {
    const userId = crypto.randomUUID();
    const store = await open();
    const older = { ...input(userId), kind: "step" as const, payload: { attemptId: "x" } };
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await submitToOutbox(older);
    vi.restoreAllMocks();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: null }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await submitToOutbox(input(userId))).toEqual({ status: "sent", data: null });
    const kinds = fetchMock.mock.calls.map(
      (call) => JSON.parse((call as unknown as [string, { body: string }])[1].body).kind,
    );
    expect(kinds).toEqual(["step", "purchase"]);
    expect(await store?.listForUser(userId)).toEqual([]);
  });

  it("returns queued when the drain throws after storing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const flushModule = await import("./flush");
    vi.spyOn(flushModule, "drainOutbox").mockRejectedValue(new Error("boom"));
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(input(userId))).toEqual({ status: "queued" });
    expect(await (await open())?.listForUser(userId)).toHaveLength(1);
  });

  it("returns unsaved when storage cannot open", async () => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const fresh = await import("./submit");
    expect(await fresh.submitToOutbox(input(crypto.randomUUID()))).toEqual({ status: "unsaved" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns unsaved when opening the database throws", async () => {
    vi.resetModules();
    vi.stubGlobal("indexedDB", {
      open() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    const fresh = await import("./submit");
    expect(await fresh.submitToOutbox(input(crypto.randomUUID()))).toEqual({ status: "unsaved" });
  });
});
