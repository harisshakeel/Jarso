import { toAppError } from "@jarso/core/lib";
import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseFetch } from "@/lib/timed-fetch";

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

// createTimedFetch's own tests live in packages/core/tests/lib/timed-fetch.test.ts. This one keeps
// the web's end-to-end guarantee: a hung Supabase call reaches toAppError as UNAVAILABLE.
describe("supabaseFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it("reaches toAppError as UNAVAILABLE through a real Supabase client after one timeout", async () => {
    const stub = hangingFetch();
    globalThis.fetch = stub as unknown as typeof fetch;
    const client = createClient("http://127.0.0.1:54321", "test-key", {
      db: { retry: false },
      global: { fetch: supabaseFetch },
    });

    const p = Promise.resolve(client.rpc("x")); // the builder is lazy until awaited
    await vi.advanceTimersByTimeAsync(8000);
    const { error } = await p;

    expect(error?.code).toBe("JA503");
    expect(stub).toHaveBeenCalledTimes(1);
    expect(toAppError(error, "fallback").code).toBe("UNAVAILABLE");
  });
});
