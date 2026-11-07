import type { OutboxPlatform } from "@jarso/core/offline";
import { submitToOutbox } from "@jarso/core/offline";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as flushModule from "../../src/offline/outbox/flush";
import { makePlatform, storeOf } from "./test-utils";

let platform: OutboxPlatform;

beforeEach(() => {
  platform = makePlatform();
});
afterEach(() => {
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
  platform.fetch = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

async function itemsOf(userId: string) {
  return (await storeOf(platform)).listForUser(userId);
}

describe("submit", () => {
  it("stores before sending so a crash mid-send keeps the item", async () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    platform.fetch = fetchMock;
    const userId = crypto.randomUUID();
    const data = input(userId);

    void submitToOutbox(platform, data);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const items = await itemsOf(userId);
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
    expect(await submitToOutbox(platform, input(userId))).toEqual({
      status: "sent",
      data: { id: "entry-1" },
    });
    expect(await itemsOf(userId)).toEqual([]);
  });

  it("returns queued and keeps the item when the network fails", async () => {
    platform.fetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(platform, input(userId))).toEqual({ status: "queued" });
    const items = await itemsOf(userId);
    expect(items[0]).toMatchObject({ status: "waiting", attempts: 1 });
  });

  it("returns queued without sending when the browser is offline", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    platform.fetch = fetchMock;
    platform.isOffline = () => true;
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(platform, input(userId))).toEqual({ status: "queued" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await itemsOf(userId)).toHaveLength(1);
  });

  it("returns refused with the server message", async () => {
    respond(409, { error: { code: "CONFLICT", message: "Not enough in Spend." } });
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(platform, input(userId))).toEqual({
      status: "refused",
      message: "Not enough in Spend.",
    });
    const items = await itemsOf(userId);
    expect(items[0]).toMatchObject({ status: "needs_look", message: "Not enough in Spend." });
  });

  it("uses a fresh uuid as the id for non-purchase kinds and keeps the key", async () => {
    platform.isOffline = () => true;
    const userId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();
    await submitToOutbox(platform, {
      userId,
      kind: "step",
      payload: { attemptId: "a" },
      idempotencyKey,
    });
    const [item] = await itemsOf(userId);
    expect(item?.idempotencyKey).toBe(idempotencyKey);
    expect(item?.id).not.toBe(idempotencyKey);
  });

  it("sends older waiting items first", async () => {
    const userId = crypto.randomUUID();
    const older = { ...input(userId), kind: "step" as const, payload: { attemptId: "x" } };
    platform.isOffline = () => true;
    await submitToOutbox(platform, older);
    platform.isOffline = () => false;
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ data: null }), { status: 200 }),
    );
    platform.fetch = fetchMock;
    expect(await submitToOutbox(platform, input(userId))).toEqual({ status: "sent", data: null });
    const kinds = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).kind);
    expect(kinds).toEqual(["step", "purchase"]);
    expect(await itemsOf(userId)).toEqual([]);
  });

  it("sends an item submitted in the same millisecond as the last one", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2030-01-01T00:00:00.000Z"));
    platform.isOffline = () => true;
    await submitToOutbox(platform, input(crypto.randomUUID()));
    platform.isOffline = () => false;
    respond(200, { data: null });
    expect(await submitToOutbox(platform, input(crypto.randomUUID()))).toEqual({
      status: "sent",
      data: null,
    });
  });

  it("returns queued when the drain throws after storing", async () => {
    platform.fetch = vi.fn<typeof fetch>();
    vi.spyOn(flushModule, "drainOutbox").mockRejectedValue(new Error("boom"));
    const userId = crypto.randomUUID();
    expect(await submitToOutbox(platform, input(userId))).toEqual({ status: "queued" });
    expect(await itemsOf(userId)).toHaveLength(1);
  });

  it("returns unsaved when storage cannot open and the browser is offline", async () => {
    platform.openStore = async () => null;
    platform.isOffline = () => true;
    const fetchMock = vi.fn<typeof fetch>();
    platform.fetch = fetchMock;
    expect(await submitToOutbox(platform, input(crypto.randomUUID()))).toEqual({
      status: "unsaved",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns unsaved when opening the database throws and the browser is offline", async () => {
    platform.openStore = () => Promise.reject(new DOMException("blocked", "SecurityError"));
    platform.isOffline = () => true;
    expect(await submitToOutbox(platform, input(crypto.randomUUID()))).toEqual({
      status: "unsaved",
    });
  });

  describe("without storage, online", () => {
    beforeEach(() => {
      platform.openStore = async () => null;
    });

    it("sends the item directly with the same key and returns sent", async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ data: { id: "entry-1" } }), { status: 200 }),
        );
      platform.fetch = fetchMock;
      const data = input(crypto.randomUUID());
      expect(await submitToOutbox(platform, data)).toEqual({
        status: "sent",
        data: { id: "entry-1" },
      });
      expect(fetchMock).toHaveBeenCalledOnce();
      const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(sent).toMatchObject({ kind: "purchase", userId: data.userId, payload: data.payload });
      expect(sent.payload.idempotencyKey).toBe(data.idempotencyKey);
    });

    it("returns refused with the server message", async () => {
      respond(409, { error: { code: "CONFLICT", message: "Not enough in Spend." } });
      expect(await submitToOutbox(platform, input(crypto.randomUUID()))).toEqual({
        status: "refused",
        message: "Not enough in Spend.",
      });
    });

    it("returns unsent when the direct send doesn't go through", async () => {
      platform.fetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
      expect(await submitToOutbox(platform, input(crypto.randomUUID()))).toEqual({
        status: "unsent",
      });
    });
  });
});
