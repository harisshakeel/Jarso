import "fake-indexeddb/auto";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flush } from "../outbox/flush";
import { reportNetworkSuccess } from "../use-online";
import { OutboxSync } from "./outbox-sync";

vi.mock("../outbox/flush", () => ({ flush: vi.fn(async () => {}) }));

afterEach(() => {
  cleanup();
  vi.mocked(flush).mockClear();
});

describe("OutboxSync", () => {
  it("flushes on mount, on online, on visible and after a network success", () => {
    render(<OutboxSync userId="user-a" />);
    expect(flush).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(flush).toHaveBeenCalledTimes(2);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(flush).toHaveBeenCalledTimes(3);
    act(() => reportNetworkSuccess());
    expect(flush).toHaveBeenCalledTimes(4);
    expect(vi.mocked(flush).mock.calls.every(([userId]) => userId === "user-a")).toBe(true);
  });

  it("stops listening when unmounted", () => {
    const { unmount } = render(<OutboxSync userId="user-a" />);
    unmount();
    act(() => {
      window.dispatchEvent(new Event("online"));
      reportNetworkSuccess();
    });
    expect(flush).toHaveBeenCalledTimes(1);
  });
});
