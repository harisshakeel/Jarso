import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushOutbox } from "../outbox/flush";
import { makeItem } from "../outbox/test-utils";
import type { OutboxItem } from "../outbox/types";
import { reportNetworkSuccess } from "../use-online";
import { OutboxSync } from "./outbox-sync";

const outboxes = new Map<string, OutboxItem[]>();

vi.mock("../outbox/flush", () => ({ flushOutbox: vi.fn(async () => {}) }));
vi.mock("../outbox/use-outbox", () => ({
  useOutbox: (userId: string) => outboxes.get(userId) ?? [],
}));

function callsFor(userId: string) {
  return vi.mocked(flushOutbox).mock.calls.filter(([id]) => id === userId).length;
}

function inMs(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

afterEach(() => {
  cleanup();
  outboxes.clear();
  vi.mocked(flushOutbox).mockClear();
  vi.useRealTimers();
});

describe("OutboxSync", () => {
  it("flushes on mount, on online, on visible and after a network success", () => {
    render(<OutboxSync userId="user-a" />);
    expect(flushOutbox).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(flushOutbox).toHaveBeenCalledTimes(2);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(flushOutbox).toHaveBeenCalledTimes(3);
    act(() => reportNetworkSuccess());
    expect(flushOutbox).toHaveBeenCalledTimes(4);
    expect(callsFor("user-a")).toBe(4);
  });

  it("stops listening when unmounted", () => {
    const { unmount } = render(<OutboxSync userId="user-a" />);
    unmount();
    act(() => {
      window.dispatchEvent(new Event("online"));
      reportNetworkSuccess();
    });
    expect(flushOutbox).toHaveBeenCalledTimes(1);
  });

  it("flushes when the earliest nextAttemptAt arrives", () => {
    vi.useFakeTimers();
    outboxes.set("user-a", [
      makeItem({ userId: "user-a", nextAttemptAt: inMs(5_000) }),
      makeItem({ userId: "user-a", nextAttemptAt: inMs(2_000) }),
      makeItem({ userId: "user-a", nextAttemptAt: inMs(1_000), status: "needs_look" }),
    ]);
    render(<OutboxSync userId="user-a" />);
    expect(callsFor("user-a")).toBe(1);
    act(() => vi.advanceTimersByTime(1_999));
    expect(callsFor("user-a")).toBe(1);
    act(() => vi.advanceTimersByTime(1));
    expect(callsFor("user-a")).toBe(2);
  });

  it("clears its timers on unmount and on userId change", () => {
    vi.useFakeTimers();
    outboxes.set("user-a", [makeItem({ userId: "user-a", nextAttemptAt: inMs(2_000) })]);
    const { rerender, unmount } = render(<OutboxSync userId="user-a" />);
    rerender(<OutboxSync userId="user-b" />);
    act(() => vi.advanceTimersByTime(60_000));
    expect(callsFor("user-a")).toBe(1);
    expect(callsFor("user-b")).toBe(1);

    rerender(<OutboxSync userId="user-a" />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(60_000));
    expect(callsFor("user-a")).toBe(2);
  });
});
