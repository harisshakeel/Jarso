import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    const item = makeItem();
    const outcome = await sendToServer(item);
    expect(outcome).toEqual({ kind: "refused", message });
    expect(nextState(item, outcome, new Date())).toMatchObject({ status: "needs_look", message });
  });

  it("posts kind and payload with occurredAt to the outbox route", async () => {
    const fetchMock = respond(200, { data: { id: "entry-1" } });
    const item = makeItem({
      kind: "purchase",
      payload: { amount: "1.50", label: "Snack", idempotencyKey: "k" },
      occurredAt: "2026-10-30T09:00:00.000Z",
    });
    expect(await sendToServer(item)).toEqual({ kind: "done", data: { id: "entry-1" } });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/outbox");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      kind: "purchase",
      payload: {
        amount: "1.50",
        label: "Snack",
        idempotencyKey: "k",
        occurredAt: "2026-10-30T09:00:00.000Z",
      },
    });
    expect(isOnline()).toBe(true);
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

  it("a 401 is unauthorized", async () => {
    respond(401, { error: { code: "UNAUTHORIZED", message: "Please sign in again." } });
    expect(await sendToServer(makeItem())).toEqual({ kind: "unauthorized" });
  });
});
