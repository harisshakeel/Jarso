import { guideCopy } from "@jarso/core/guide";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThinkingBubble } from "@/features/guide/components/thinking-bubble";

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

const steps = () =>
  screen
    .getAllByRole("listitem")
    .map((item) => `${item.textContent}:${item.getAttribute("data-step")}`);

describe("ThinkingBubble", () => {
  it("shows the latest status line under the AI label, or Thinking… before the first", () => {
    const { rerender } = render(<ThinkingBubble status={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.thinking);
    expect(screen.getByText(guideCopy.label)).toBeInTheDocument();
    rerender(<ThinkingBubble status={guideCopy.status.get_jars} />);
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.status.get_jars);
  });

  it("lights the four steps up as the server's lines arrive", () => {
    const { rerender } = render(<ThinkingBubble status={guideCopy.phases.reading} />);
    expect(steps()).toEqual([
      "Reading:current",
      "Looking things up:next",
      "Writing:next",
      "Checking:next",
    ]);
    expect(screen.getByText("Reading")).toHaveAttribute("aria-current", "step");
    rerender(<ThinkingBubble status={guideCopy.status.get_allowance} />);
    expect(steps()).toEqual([
      "Reading:done",
      "Looking things up:current",
      "Writing:next",
      "Checking:next",
    ]);
    rerender(<ThinkingBubble status={guideCopy.phases.answering} />);
    expect(steps()[2]).toBe("Writing:current");
    rerender(<ThinkingBubble status={guideCopy.phases.checking} />);
    expect(steps()).toEqual([
      "Reading:done",
      "Looking things up:done",
      "Writing:done",
      "Checking:current",
    ]);
  });

  it("drops coins into the jar while thinking and draws a check while checking", () => {
    allowMotion(true);
    const { container, rerender } = render(<ThinkingBubble status={guideCopy.status.get_jars} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-motion", "on");
    const jar = container.querySelector("[data-jarso-eyes]");
    expect(jar).toHaveAttribute("data-look", "up");
    expect(jar).toHaveAttribute("data-filling");
    expect(container.querySelectorAll(".jar-drop")).toHaveLength(3);
    expect(container.querySelector("[data-check]")).toBeNull();
    rerender(<ThinkingBubble status={guideCopy.phases.checking} />);
    expect(container.querySelector("[data-check]")).not.toBeNull();
  });

  it("stays still under reduced motion: the jar looking ahead, the line and the steps", () => {
    allowMotion(false);
    const { container } = render(<ThinkingBubble status={guideCopy.status.get_jars} />);
    expect(screen.getByRole("status")).toHaveAttribute("data-motion", "still");
    const jar = container.querySelector("[data-jarso-eyes]");
    expect(jar).toHaveAttribute("data-look", "ahead");
    expect(jar).not.toHaveAttribute("data-filling");
    expect(container.querySelector(".jar-drop")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.status.get_jars);
    expect(steps()[1]).toBe("Looking things up:current");
  });

  it("turns to the still-working lines when no new line arrives, and resets on a new one", () => {
    vi.useFakeTimers();
    const { rerender } = render(<ThinkingBubble status={guideCopy.phases.answering} />);
    act(() => vi.advanceTimersByTime(4_000));
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.phases.answering);
    act(() => vi.advanceTimersByTime(1_500));
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.stillWorking[0] as string);
    act(() => vi.advanceTimersByTime(3_000));
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.stillWorking[1] as string);
    // A fresh line from the server takes over again.
    rerender(<ThinkingBubble status={guideCopy.phases.checking} />);
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.phases.checking);
  });
});
