import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enteredInbox, InboxRefresh } from "./inbox-refresh";

const refresh = vi.fn();
let pathname = "/child";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => pathname,
}));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
}
function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  refresh.mockClear();
  pathname = "/child";
  setOnline(true);
});
afterEach(cleanup);

describe("enteredInbox", () => {
  it("is true only when moving onto an inbox route", () => {
    expect(enteredInbox("/child", "/child/inbox")).toBe(true);
    expect(enteredInbox("/parent", "/parent/inbox")).toBe(true);
    expect(enteredInbox(null, "/child/inbox")).toBe(false);
    expect(enteredInbox("/child/inbox", "/child/inbox")).toBe(false);
    expect(enteredInbox("/child/inbox", "/child")).toBe(false);
  });
});

describe("InboxRefresh", () => {
  it("refreshes when the tab becomes visible again", () => {
    render(<InboxRefresh />);
    setVisibility("hidden");
    expect(refresh).not.toHaveBeenCalled();
    setVisibility("visible");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("skips the refresh while offline", () => {
    render(<InboxRefresh />);
    setOnline(false);
    setVisibility("visible");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the user navigates into the inbox, not on first render", () => {
    const { rerender } = render(<InboxRefresh />);
    expect(refresh).not.toHaveBeenCalled();
    pathname = "/child/inbox";
    rerender(<InboxRefresh />);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when navigating to other pages", () => {
    const { rerender } = render(<InboxRefresh />);
    pathname = "/child/missions";
    rerender(<InboxRefresh />);
    expect(refresh).not.toHaveBeenCalled();
  });
});
