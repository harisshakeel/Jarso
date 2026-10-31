import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoticeChange } from "../realtime";
import type { Notice } from "../types";
import { NoticeListener } from "./notice-listener";

const { push, refresh, toast, unsubscribe, handlers } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
  unsubscribe: vi.fn(),
  handlers: {} as {
    onChange?: (change: NoticeChange) => void;
    onStatus?: (connected: boolean) => void;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("sonner", () => ({ toast }));
vi.mock("../realtime", () => ({
  subscribeToNotices: vi.fn((_userId, onChange, onStatus) => {
    handlers.onChange = onChange;
    handlers.onStatus = onStatus;
    return unsubscribe;
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const notice: Notice = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "withdrawal_decided",
  childId: "c1",
  childName: "",
  sourceType: "request",
  sourceId: "r1",
  payload: { approved: true, amount_minor: 500 },
  createdAt: "2026-10-31T09:00:00Z",
  read: false,
};

describe("NoticeListener", () => {
  it("toasts a new notice and refreshes once per burst", () => {
    render(<NoticeListener userId="u1" viewer="child" currency="GBP" />);
    handlers.onChange?.({ type: "new", notice });
    handlers.onChange?.({ type: "updated" });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]?.[0]).toBe("Your parent said yes");
    expect(refresh).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("refreshes without a toast when a notice is read elsewhere", () => {
    render(<NoticeListener userId="u1" viewer="parent" currency="GBP" />);
    handlers.onChange?.({ type: "updated" });
    vi.runAllTimers();
    expect(toast).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("catches up after a reconnect, not on the first connect", () => {
    render(<NoticeListener userId="u1" viewer="parent" currency="GBP" />);
    handlers.onStatus?.(true);
    vi.runAllTimers();
    expect(refresh).not.toHaveBeenCalled();
    handlers.onStatus?.(false);
    handlers.onStatus?.(true);
    vi.runAllTimers();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("opens the inbox from the toast and unsubscribes on unmount", () => {
    const { unmount } = render(<NoticeListener userId="u1" viewer="parent" currency="GBP" />);
    handlers.onChange?.({ type: "new", notice: { ...notice, kind: "deposit_requested" } });
    toast.mock.calls[0]?.[1]?.action.onClick();
    expect(push).toHaveBeenCalledWith("/parent/inbox");
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
