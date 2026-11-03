import type { OutboxPlatform } from "@jarso/core/offline";
import { nextState, offlineCopy, sendToServer } from "@jarso/core/offline";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeItem, makePlatform } from "./test-utils";

let platform: OutboxPlatform;

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  platform.fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  platform = makePlatform();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("outcome", () => {
  it("VALIDATION becomes needs_look", async () => {
    const message = "Please check what you entered and try again.";
    respond(400, { error: { code: "VALIDATION", message } });
    // Purchases park as needs_look; a refused learning result is dropped (state.test.ts).
    const item = makeItem({ kind: "purchase" });
    const outcome = await sendToServer(platform, item);
    expect(outcome).toEqual({ kind: "refused", message });
    expect(nextState(item, outcome, new Date())).toMatchObject({ status: "needs_look", message });
  });

  it("posts kind, payload and the action's age to the outbox route", async () => {
    const fetchMock = respond(200, { data: { id: "entry-1" } });
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-30T09:05:00.000Z"));
    const item = makeItem({
      kind: "purchase",
      payload: { amount: "1.50", label: "Snack", idempotencyKey: "k" },
      createdAt: "2026-10-30T09:00:00.000Z",
    });
    expect(await sendToServer(platform, item)).toEqual({ kind: "done", data: { id: "entry-1" } });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/outbox");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "purchase",
      userId: item.userId,
      ageMs: 5 * 60_000,
      payload: { amount: "1.50", label: "Snack", idempotencyKey: "k" },
    });
    expect(platform.onNetworkSuccess).toHaveBeenCalledOnce();
    expect(platform.onNetworkFailure).not.toHaveBeenCalled();
  });

  it("a device clock 1 h fast sends an age of about 0, never a time", async () => {
    const fetchMock = respond(200, { data: { id: "entry-1" } });
    const fast = Date.parse("2026-10-30T10:00:00.000Z") + 60 * 60_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(fast);
    const item = makeItem({ kind: "purchase", createdAt: new Date(fast).toISOString() });
    now.mockReturnValue(fast + 40);
    await sendToServer(platform, item);
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sent.ageMs).toBe(40);
    expect(JSON.stringify(sent)).not.toContain("occurredAt");
  });

  it("a createdAt ahead of the clock sends age 0", async () => {
    const fetchMock = respond(200, { data: {} });
    await sendToServer(
      platform,
      makeItem({ createdAt: new Date(Date.now() + 60_000).toISOString() }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).ageMs).toBe(0);
  });

  it("a network failure is a retry and reports the connection lost", async () => {
    platform.fetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await sendToServer(platform, makeItem())).toEqual({ kind: "retry" });
    expect(platform.onNetworkFailure).toHaveBeenCalledOnce();
  });

  it("a timeout is a retry but does not report the connection lost", async () => {
    platform.fetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    expect(await sendToServer(platform, makeItem())).toEqual({ kind: "retry" });
    expect(platform.onNetworkFailure).not.toHaveBeenCalled();
  });

  it("times out after 15 s without AbortSignal.timeout (Hermes has none)", async () => {
    vi.useFakeTimers();
    const timeout = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
    delete (AbortSignal as { timeout?: unknown }).timeout;
    try {
      let signal: AbortSignal | undefined;
      platform.fetch = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener("abort", () =>
              reject(Object.assign(new Error("Aborted"), { name: "AbortError" })),
            );
          }),
      );
      const outcome = sendToServer(platform, makeItem());
      await vi.advanceTimersByTimeAsync(14_999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await outcome).toEqual({ kind: "retry" });
      expect(signal?.aborted).toBe(true);
      // A slow link, not a lost one.
      expect(platform.onNetworkFailure).not.toHaveBeenCalled();
    } finally {
      if (timeout) Object.defineProperty(AbortSignal, "timeout", timeout);
      vi.useRealTimers();
    }
  });

  it("times out a 200 whose body stalls after the headers, as a retry", async () => {
    vi.useFakeTimers();
    try {
      const stalled = new Response(null, { status: 200 });
      vi.spyOn(stalled, "json").mockReturnValue(new Promise(() => {}));
      platform.fetch = vi.fn<typeof fetch>().mockResolvedValue(stalled);
      let settled = false;
      const outcome = sendToServer(platform, makeItem()).finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await outcome).toEqual({ kind: "retry" });
      expect(platform.onNetworkSuccess).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears its timer once the server answers", async () => {
    vi.useFakeTimers();
    try {
      respond(200, { data: {} });
      await sendToServer(platform, makeItem());
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("an expo/fetch FetchError is a retry and reports the connection lost", async () => {
    platform.fetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(Object.assign(new Error("fetch failed: offline"), { name: "FetchError" }));
    expect(await sendToServer(platform, makeItem())).toEqual({ kind: "retry" });
    expect(platform.onNetworkFailure).toHaveBeenCalledOnce();
  });

  it("a 503 is a retry", async () => {
    respond(503, { error: { code: "UNAVAILABLE", message: "Jarso is taking a while." } });
    expect(await sendToServer(platform, makeItem())).toEqual({ kind: "retry" });
    // The server answered: the device is not offline.
    expect(platform.onNetworkFailure).not.toHaveBeenCalled();
  });

  it("a 408 is a retry", async () => {
    respond(408, { error: { code: "TIMEOUT", message: "Request timed out" } });
    expect(await sendToServer(platform, makeItem())).toEqual({ kind: "retry" });
  });

  it("a 429 is a retry, not a refusal", async () => {
    respond(429, { error: { code: "RATE_LIMITED", message: "Too many tries." } });
    expect(await sendToServer(platform, makeItem())).toEqual({ kind: "retry" });
  });

  it("a refusal without a message uses the fallback copy", async () => {
    respond(403, {});
    expect(await sendToServer(platform, makeItem())).toEqual({
      kind: "refused",
      message: offlineCopy.refused,
    });
  });

  it("a 401 is unauthorized", async () => {
    respond(401, { error: { code: "UNAUTHORIZED", message: "Please sign in again." } });
    expect(await sendToServer(platform, makeItem())).toEqual({ kind: "unauthorized" });
  });

  it("posts to baseUrl with platform headers", async () => {
    const fetchMock = respond(200, { data: { id: "entry-1" } });
    platform.baseUrl = "https://api.example";
    platform.headers = async () => ({ Authorization: "Bearer t" });
    expect(await sendToServer(platform, makeItem())).toEqual({
      kind: "done",
      data: { id: "entry-1" },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.example/api/v1/outbox");
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      Authorization: "Bearer t",
    });
  });
});
