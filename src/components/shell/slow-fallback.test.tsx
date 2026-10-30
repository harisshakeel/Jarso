import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlowFallback } from "./slow-fallback";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SlowFallback", () => {
  it("shows only the skeleton before 10 s", () => {
    render(
      <SlowFallback>
        <p>skeleton</p>
      </SlowFallback>,
    );
    act(() => {
      vi.advanceTimersByTime(9_999);
    });
    expect(screen.getByText("skeleton")).toBeInTheDocument();
    expect(screen.queryByText("This is taking a while. Try again?")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the slow copy and Try again after 10 s", () => {
    render(
      <SlowFallback>
        <p>skeleton</p>
      </SlowFallback>,
    );
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("skeleton")).toBeInTheDocument();
    expect(screen.getByText("This is taking a while. Try again?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("clears its timer on unmount", () => {
    const { unmount } = render(
      <SlowFallback>
        <p>skeleton</p>
      </SlowFallback>,
    );
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  describe("after Try again", () => {
    const reload = vi.fn();
    beforeEach(() => {
      reload.mockClear();
      vi.stubGlobal("location", { ...window.location, reload });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function showSlow() {
      const view = render(
        <SlowFallback>
          <p>skeleton</p>
        </SlowFallback>,
      );
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      return view;
    }

    it("Try again refreshes and shows Trying…", () => {
      showSlow();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("button", { name: "Trying…" })).toBeDisabled();
    });

    it("reloads if still showing 5 s after Try again", () => {
      showSlow();
      act(() => {
        vi.advanceTimersByTime(4_999);
      });
      expect(reload).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it("does not reload when it unmounts before 5 s", () => {
      const { unmount } = showSlow();
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      unmount();
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(reload).not.toHaveBeenCalled();
    });
  });

  it("keeps a status region mounted from the start", () => {
    render(
      <SlowFallback>
        <p>skeleton</p>
      </SlowFallback>,
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
