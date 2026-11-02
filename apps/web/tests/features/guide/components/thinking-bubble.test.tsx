import { guideCopy } from "@jarso/core/guide";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThinkingBubble } from "@/features/guide/components/thinking-bubble";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ThinkingBubble", () => {
  it("shows the latest status line under the AI chip, or Thinking… before the first", () => {
    const { rerender } = render(<ThinkingBubble status={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.thinking);
    expect(screen.getByText(guideCopy.label)).toBeInTheDocument();
    rerender(<ThinkingBubble status={guideCopy.status.get_jars} />);
    expect(screen.getByRole("status")).toHaveTextContent(guideCopy.status.get_jars);
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
