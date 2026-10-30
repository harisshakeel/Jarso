import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("./logger", () => ({ logger: { warn: (...args: unknown[]) => warn(...args) } }));

const { createTimedFetch, isTimedFetchError } = await import("./timed-fetch");

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

  it("rejects with TimedFetchError after timeoutMs", async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });

    const p = timed("https://x.supabase.co/rest/v1/jars");
    const assertion = expect(p).rejects.toMatchObject({ code: "JA503" });
    await vi.advanceTimersByTimeAsync(8000);
    await assertion;
    await expect(p).rejects.toSatisfy(isTimedFetchError);
  });

  it("honours a caller abort signal", async () => {
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });
    const controller = new AbortController();

    const p = timed("https://x.supabase.co/rest/v1/jars", { signal: controller.signal });
    const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(new DOMException("aborted", "AbortError"));
    await assertion;
    await expect(p).rejects.not.toSatisfy(isTimedFetchError);
  });

  it("wraps a network TypeError as TimedFetchError", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });

    await expect(timed("https://x.supabase.co/rest/v1/jars")).rejects.toMatchObject({
      code: "JA503",
    });
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
