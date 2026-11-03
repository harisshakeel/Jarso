import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TypedText } from "@/features/guide/components/typed-text";

/** jsdom has no `matchMedia`; pretend the device allows motion, or asks for less. */
function allowMotion(allowed: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("no-preference") ? allowed : !allowed,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const text = "You have £12.40 in Spend and £64 in Save.";

describe("TypedText", () => {
  it("types a live reply out word by word, keeping the whole text for assistive technology", () => {
    allowMotion(true);
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<TypedText text={text} animate onDone={onDone} />);
    const p = screen.getByText(text).closest("p");
    expect(p).toHaveAttribute("aria-busy", "true");
    // The whole text is there for a screen reader; sighted readers have the first word so far.
    expect(screen.getByText(text)).toHaveClass("sr-only");
    expect(p?.querySelector("[aria-hidden]")).toHaveTextContent(/^You$/);
    act(() => vi.advanceTimersByTime(40 * 3));
    expect(p?.querySelector("[aria-hidden]")).toHaveTextContent(/^You have £12.40 in$/);
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(40 * 10));
    // Done: one plain paragraph, money figures in their own spans.
    expect(screen.queryByText(text)).toBeNull();
    expect(p).not.toHaveAttribute("aria-busy");
    expect(p).toHaveTextContent(text);
    expect(screen.getByText("£12.40")).toHaveClass("money");
    expect(screen.getByText("£64")).toHaveClass("money");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("shows the whole reply at once under reduced motion, and when it is not live", () => {
    allowMotion(false);
    const { rerender } = render(<TypedText text={text} animate />);
    expect(screen.getByText("£64").closest("p")).toHaveTextContent(text);
    allowMotion(true);
    rerender(<TypedText text="Spend is the cash you hold." />);
    expect(screen.getByText("Spend is the cash you hold.")).not.toHaveAttribute("aria-busy");
  });

  it("never takes longer than two seconds, however long the reply", () => {
    allowMotion(true);
    vi.useFakeTimers();
    const long = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");
    render(<TypedText text={long} animate />);
    act(() => vi.advanceTimersByTime(2_050));
    expect(screen.getByText(long)).not.toHaveAttribute("aria-busy");
  });
});
