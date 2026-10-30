import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineCopy } from "../copy";
import { isOnline, reportNetworkSuccess } from "../use-online";
import { sendToServer } from "./send";
import { nextState } from "./state";
import { makeItem } from "./test-utils";

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => reportNetworkSuccess());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("outcome", () => {
  it("VALIDATION becomes needs_look", async () => {
    const message = "Please check what you entered and try again.";
    respond(400, { error: { code: "VALIDATION", message } });
    // Purchases park as needs_look; a refused learning result is dropped (state.test.ts).
    const item = makeItem({ kind: "purchase" });
    const outcome = await sendToServer(item);
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
    expect(await sendToServer(item)).toEqual({ kind: "done", data: { id: "entry-1" } });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/outbox");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      kind: "purchase",
      userId: item.userId,
      ageMs: 5 * 60_000,
      payload: { amount: "1.50", label: "Snack", idempotencyKey: "k" },
    });
    expect(isOnline()).toBe(true);
  });

  it("a device clock 1 h fast sends an age of about 0, never a time", async () => {
    const fetchMock = respond(200, { data: { id: "entry-1" } });
    const fast = Date.parse("2026-10-30T10:00:00.000Z") + 60 * 60_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(fast);
    const item = makeItem({ kind: "purchase", createdAt: new Date(fast).toISOString() });
    now.mockReturnValue(fast + 40);
    await sendToServer(item);
    const sent = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(sent.ageMs).toBe(40);
    expect(JSON.stringify(sent)).not.toContain("occurredAt");
  });

  it("a createdAt ahead of the clock sends age 0", async () => {
    const fetchMock = respond(200, { data: {} });
    await sendToServer(makeItem({ createdAt: new Date(Date.now() + 60_000).toISOString() }));
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body).ageMs).toBe(0);
  });

  it("a network failure is a retry and reports the connection lost", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(await sendToServer(makeItem())).toEqual({ kind: "retry" });
    expect(isOnline()).toBe(false);
  });

  it("a 503 is a retry", async () => {
    respond(503, { error: { code: "UNAVAILABLE", message: "Jarso is taking a while." } });
    expect(await sendToServer(makeItem())).toEqual({ kind: "retry" });
  });

  it("a 408 is a retry", async () => {
    respond(408, { error: { code: "TIMEOUT", message: "Request timed out" } });
    expect(await sendToServer(makeItem())).toEqual({ kind: "retry" });
  });

  it("a 429 is a retry, not a refusal", async () => {
    respond(429, { error: { code: "RATE_LIMITED", message: "Too many tries." } });
    expect(await sendToServer(makeItem())).toEqual({ kind: "retry" });
  });

  it("a refusal without a message uses the fallback copy", async () => {
    respond(403, {});
    expect(await sendToServer(makeItem())).toEqual({
      kind: "refused",
      message: offlineCopy.refused,
    });
  });

  it("a 401 is unauthorized", async () => {
    respond(401, { error: { code: "UNAUTHORIZED", message: "Please sign in again." } });
    expect(await sendToServer(makeItem())).toEqual({ kind: "unauthorized" });
  });
});
