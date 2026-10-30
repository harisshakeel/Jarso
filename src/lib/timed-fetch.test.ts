import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("./logger", () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));

const { createTimedFetch } = await import("./timed-fetch");
const { toAppError } = await import("./db-error");

const realFetch = globalThis.fetch;

/** Stub that never resolves but rejects with the signal's reason when aborted, like real fetch. */
function hangingFetch() {
  return vi.fn(
    (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      }),
  );
}

describe("createTimedFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    warn.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it("resolves a 503 JA503 response after timeoutMs", async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });

    const p = timed("https://x.supabase.co/rest/v1/jars?select=*");
    await vi.advanceTimersByTimeAsync(8000);
    const res = await p;

    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({
      code: "JA503",
      message: "Jarso is taking a while. Please try again.",
    });
    expect(warn).toHaveBeenCalledWith("Upstream call failed", {
      name: "supabase",
      path: "/rest/v1/jars",
      durationMs: 8000,
      reason: "timeout",
    });
  });

  it("caller abort still rejects", async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });
    const controller = new AbortController();

    const p = timed("https://x.supabase.co/rest/v1/jars", { signal: controller.signal });
    const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("aborted", "AbortError"));
    await assertion;
    expect(warn).not.toHaveBeenCalled();
  });

  it("resolves a 503 JA503 response on a network TypeError", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });

    const res = await timed("https://x.supabase.co/rest/v1/jars");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("JA503");
    expect(warn).toHaveBeenCalledWith(
      "Upstream call failed",
      expect.objectContaining({ reason: "network", path: "/rest/v1/jars" }),
    );
  });

  it("reaches toAppError as UNAVAILABLE through a real Supabase client after one timeout", async () => {
    const stub = hangingFetch();
    globalThis.fetch = stub as unknown as typeof fetch;
    const client = createClient("http://127.0.0.1:54321", "test-key", {
      db: { retry: false },
      global: { fetch: createTimedFetch({ timeoutMs: 8000, name: "supabase" }) },
    });

    const p = Promise.resolve(client.rpc("x")); // the builder is lazy until awaited
    await vi.advanceTimersByTimeAsync(8000);
    const { error } = await p;

    expect(error?.code).toBe("JA503");
    expect(stub).toHaveBeenCalledTimes(1);
    expect(toAppError(error, "fallback").code).toBe("UNAVAILABLE");
  });

  it("logs a slow call without query string", async () => {
    globalThis.fetch = vi.fn(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(new Response("{}")), 1200)),
    ) as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });

    const p = timed("https://x.supabase.co/rest/v1/rpc/balance?select=*");
    await vi.advanceTimersByTimeAsync(1200);
    await p;

    expect(warn).toHaveBeenCalledWith(
      "Slow upstream call",
      expect.objectContaining({ name: "supabase", path: "/rest/v1/rpc/balance", status: 200 }),
    );
    expect(warn.mock.calls[0]?.[1].durationMs).toBeGreaterThanOrEqual(1200);
  });

  it("stays quiet for a fast call", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });

    await timed("https://x.supabase.co/rest/v1/jars");
    expect(warn).not.toHaveBeenCalled();
  });
});
