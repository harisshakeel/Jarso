import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("../../src/lib/logger", () => ({
  logger: { warn: (...args: unknown[]) => warn(...args) },
}));

const { createTimedFetch } = await import("../../src/lib/timed-fetch");

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

  it("resolves a 503 when the body stalls after the headers", async () => {
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      // Headers arrive, then the body sends one chunk and stops, like a stalled stream.
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('[{"id":'));
          init?.signal?.addEventListener("abort", () => controller.error(init.signal?.reason));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const timed = createTimedFetch({ timeoutMs: 8000, name: "supabase" });

    const p = timed("https://x.supabase.co/rest/v1/jars");
    await vi.advanceTimersByTimeAsync(8000);
    const res = await p;

    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "JA503" });
    expect(warn).toHaveBeenCalledWith(
      "Upstream call failed",
      expect.objectContaining({ reason: "timeout" }),
    );
  });

  it("hands back the whole body with the same status and headers", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response('{"ok":true}', {
          status: 201,
          statusText: "Created",
          headers: { "content-type": "application/json", "content-range": "0-0/1" },
        }),
    ) as unknown as typeof fetch;
    const res = await createTimedFetch({ timeoutMs: 8000, name: "supabase" })("https://x.co/a");
    expect(res.status).toBe(201);
    expect(res.statusText).toBe("Created");
    expect(res.headers.get("content-range")).toBe("0-0/1");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("keeps a 204 without a body", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;
    const res = await createTimedFetch({ timeoutMs: 8000, name: "supabase" })("https://x.co/a");
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
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

  describe("without AbortSignal.any (Hermes)", () => {
    const any = AbortSignal.any;
    beforeEach(() => {
      // @ts-expect-error simulating an engine that lacks it
      AbortSignal.any = undefined;
    });
    afterEach(() => {
      AbortSignal.any = any;
    });

    it("still passes a caller abort through", async () => {
      globalThis.fetch = hangingFetch() as unknown as typeof fetch;
      const controller = new AbortController();
      const p = createTimedFetch({ timeoutMs: 8000, name: "supabase" })("https://x.co/a", {
        signal: controller.signal,
      });
      const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
      controller.abort(new DOMException("aborted", "AbortError"));
      await assertion;
    });

    it("rejects with the caller's own abort reason", async () => {
      globalThis.fetch = hangingFetch() as unknown as typeof fetch;
      const controller = new AbortController();
      const reason = new Error("user left");
      const p = createTimedFetch({ timeoutMs: 8000, name: "supabase" })("https://x.co/a", {
        signal: controller.signal,
      });
      const assertion = expect(p).rejects.toBe(reason);
      controller.abort(reason);
      await assertion;
    });

    it("removes its listener from the caller's signal once the call finishes", async () => {
      globalThis.fetch = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      await createTimedFetch({ timeoutMs: 8000, name: "supabase" })("https://x.co/a", {
        signal: controller.signal,
      });
      expect(add).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
    });

    it("still times out a call that carries a caller signal", async () => {
      globalThis.fetch = hangingFetch() as unknown as typeof fetch;
      const p = createTimedFetch({ timeoutMs: 8000, name: "supabase" })("https://x.co/a", {
        signal: new AbortController().signal,
      });
      await vi.advanceTimersByTimeAsync(8000);
      expect((await p).status).toBe(503);
    });
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

  it("rebuilds the response from text, so a polyfill never re-decodes bytes as Latin-1", async () => {
    // React Native's whatwg-fetch decodes an ArrayBuffer body one byte per char: "₹" → "â‚¹".
    // A string body is handed back as is, so it must be the decoded text that is passed on.
    const RealResponse = globalThis.Response;
    const bodies: unknown[] = [];
    globalThis.Response = class extends RealResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        bodies.push(body);
        super(body, init);
      }
    } as typeof Response;
    try {
      const json = JSON.stringify({ summary: "Save went up by ₹750.00 🎯 — Zoë" });
      globalThis.fetch = vi.fn(async () => new RealResponse(json)) as unknown as typeof fetch;
      const timed = createTimedFetch({ timeoutMs: 8000, name: "api" });

      const res = await timed("https://jarso.test/api/v1/dashboard");

      expect(bodies).toEqual([json]);
      expect(await res.json()).toEqual({ summary: "Save went up by ₹750.00 🎯 — Zoë" });
    } finally {
      globalThis.Response = RealResponse;
    }
  });
});
