import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { offlineCopy } from "./copy";
import { runOnline } from "./online-action";
import { isOnline, reportNetworkFailure, reportNetworkSuccess } from "./use-online";

const ok = { ok: true, data: 1 } as const;

beforeEach(() => reportNetworkSuccess());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runOnline", () => {
  it("does not call the action when offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
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

  it("still calls the action after a reported failure while navigator.onLine is true", async () => {
    reportNetworkFailure();
    const action = vi.fn().mockResolvedValue(ok);
    expect(await runOnline(action)).toEqual(ok);
    expect(action).toHaveBeenCalledOnce();
  });

  it("clears the offline state when that call succeeds", async () => {
    reportNetworkFailure();
    await runOnline(async () => ok);
    expect(isOnline()).toBe(true);
  });

  it("handles a late rejection after the timeout and clears the timer when the action settles", async () => {
    vi.useFakeTimers();
    let rejectLate: (e: Error) => void = () => {};
    const pending = runOnline(
      () =>
        new Promise((_, reject) => {
          rejectLate = reject;
        }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await pending;
    rejectLate(new Error("late"));
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await runOnline(async () => ok);
    expect(vi.getTimerCount()).toBe(0);
  });
});
