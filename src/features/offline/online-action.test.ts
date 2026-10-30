import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineCopy } from "./copy";
import { runOnline } from "./online-action";
import { isOnline, reportNetworkFailure, reportNetworkSuccess } from "./use-online";

const ok = { ok: true, data: 1 } as const;

beforeEach(() => reportNetworkSuccess());
afterEach(() => vi.useRealTimers());

describe("runOnline", () => {
  it("does not call the action when offline", async () => {
    reportNetworkFailure();
    const action = vi.fn().mockResolvedValue(ok);
    const result = await runOnline(action);
    expect(action).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.offline },
    });
  });

  it("passes a result through", async () => {
    expect(await runOnline(async () => ok)).toEqual(ok);
  });

  it("maps a rejection to the offline copy and reports a network failure", async () => {
    const result = await runOnline(() => Promise.reject(new TypeError("fetch failed")));
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.offline },
    });
    expect(isOnline()).toBe(false);
  });

  it("resolves the slow copy after 15 s", async () => {
    vi.useFakeTimers();
    const pending = runOnline(() => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.slow },
    });
    expect(isOnline()).toBe(true);
  });

  it('maps "Failed to find Server Action" to the update copy', async () => {
    const result = await runOnline(() =>
      Promise.reject(new Error('Failed to find Server Action "abc"')),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: offlineCopy.updated },
    });
    expect(isOnline()).toBe(true);
  });
});
