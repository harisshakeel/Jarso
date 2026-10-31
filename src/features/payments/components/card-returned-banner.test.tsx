import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardReturnedBanner } from "./card-returned-banner";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("CardReturnedBanner", () => {
  it.each([
    ["while the webhook is on its way", false, "Payment received, updating the jars…"],
    ["once handled, so a late refund note still shows", true, "Payment received."],
  ])("re-reads the screen a bounded number of times %s", (_name, handled, text) => {
    render(<CardReturnedBanner handled={handled} />);
    expect(screen.getByRole("status")).toHaveTextContent(text);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(5);
  });
});
